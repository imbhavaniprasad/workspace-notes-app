-- =============================================================================
-- Workspace Notes: schema + tenant isolation
--
-- Isolation model
--   * Every tenant table has RLS ENABLED and FORCED. With RLS on and no matching
--     policy, Postgres returns zero rows / rejects the write: the default is DENY.
--   * Policies only ever grant access via app.has_role(), which reads the caller
--     from auth.uid() (the verified JWT). No JWT -> auth.uid() is NULL -> every
--     check is false -> deny.
--   * The API roles (anon, authenticated) get no table privileges by default.
--     Each table gets explicit, column-level grants. A new table nobody remembers
--     to grant/RLS is unreachable rather than public.
--   * Tenant keys (workspace_id) are not updatable, and child rows reference
--     their parent with a composite FK (id, workspace_id), so a row can never be
--     moved into, or attached to, another workspace.
-- =============================================================================

-- Fail closed for anything created in the future by the migration role.
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, public;

-- Private schema for helpers: not exposed through the Data API.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

create type public.member_role as enum ('viewer', 'editor', 'owner');

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- Public profile for each auth user (auth.users is not exposed to the API).
create table public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null unique,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create table public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 100),
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

create table public.memberships (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  role         public.member_role not null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
-- Policy helper lookups go (user_id, workspace_id).
create index memberships_user_workspace_idx on public.memberships (user_id, workspace_id);

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  created_by  uuid not null default auth.uid() references public.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Target for composite FKs: children must live in the same workspace.
  unique (id, workspace_id)
);
create index projects_workspace_idx on public.projects (workspace_id, created_at desc);

create table public.notes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id   uuid not null,
  title        text not null check (char_length(title) between 1 and 200),
  body         text not null default '' check (char_length(body) <= 10000),
  created_by   uuid not null default auth.uid() references public.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (project_id, workspace_id)
    references public.projects (id, workspace_id) on delete cascade
);
create index notes_project_idx on public.notes (workspace_id, project_id, created_at desc);

create table public.project_summaries (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null,
  project_id     uuid not null,
  summary        text not null check (char_length(summary) <= 2000),
  key_points     text[] not null default '{}',
  cited_note_ids uuid[] not null default '{}',
  flags          text[] not null default '{}',
  model          text not null,
  prompt_version text not null,
  attempts       int  not null check (attempts >= 1),
  created_by     uuid not null default auth.uid() references public.users (id),
  created_at     timestamptz not null default now(),
  foreign key (project_id, workspace_id)
    references public.projects (id, workspace_id) on delete cascade
);
create index project_summaries_project_idx on public.project_summaries (workspace_id, project_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so policies on memberships don't recurse into
-- themselves; search_path pinned so they can't be hijacked).
-- -----------------------------------------------------------------------------

create function app.role_rank(r public.member_role)
returns int language sql immutable
set search_path = ''
as $$ select case r when 'viewer' then 1 when 'editor' then 2 when 'owner' then 3 end $$;

-- True when the *current authenticated user* has at least `min_role` in `ws`.
create function app.has_role(ws uuid, min_role public.member_role)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.workspace_id = ws
      and m.user_id = (select auth.uid())
      and app.role_rank(m.role) >= app.role_rank(min_role)
  )
$$;

-- True when the current user shares any workspace with `other_user`.
create function app.shares_workspace(other_user uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = other_user
  )
$$;

revoke all on function app.role_rank(public.member_role)               from public;
revoke all on function app.has_role(uuid, public.member_role)          from public;
revoke all on function app.shares_workspace(uuid)                      from public;
grant execute on function app.role_rank(public.member_role)            to authenticated;
grant execute on function app.has_role(uuid, public.member_role)       to authenticated;
grant execute on function app.shares_workspace(uuid)                   to authenticated;

-- Keep updated_at honest regardless of what the client sends.
create function app.touch_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

create trigger projects_touch before update on public.projects
  for each row execute function app.touch_updated_at();
create trigger notes_touch before update on public.notes
  for each row execute function app.touch_updated_at();

-- Mirror auth.users into public.users.
create function app.handle_new_auth_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1))
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Row level security: ENABLE + FORCE on every table
-- -----------------------------------------------------------------------------

alter table public.users             enable row level security;
alter table public.workspaces        enable row level security;
alter table public.memberships       enable row level security;
alter table public.projects          enable row level security;
alter table public.notes             enable row level security;
alter table public.project_summaries enable row level security;

alter table public.users             force row level security;
alter table public.workspaces        force row level security;
alter table public.memberships       force row level security;
alter table public.projects          force row level security;
alter table public.notes             force row level security;
alter table public.project_summaries force row level security;

-- users: yourself, plus people you share a workspace with. Written only by trigger.
create policy users_select on public.users
  for select to authenticated
  using (id = (select auth.uid()) or app.shares_workspace(id));

-- workspaces: members read, owners rename. Creation goes through create_workspace().
create policy workspaces_select on public.workspaces
  for select to authenticated
  using (app.has_role(id, 'viewer'));
create policy workspaces_update on public.workspaces
  for update to authenticated
  using (app.has_role(id, 'owner'))
  with check (app.has_role(id, 'owner'));

-- memberships: members see the member list; only owners change it.
create policy memberships_select on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or app.has_role(workspace_id, 'viewer'));
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (app.has_role(workspace_id, 'owner'));
create policy memberships_update on public.memberships
  for update to authenticated
  using (app.has_role(workspace_id, 'owner'))
  with check (app.has_role(workspace_id, 'owner'));
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (app.has_role(workspace_id, 'owner'));

-- projects / notes: viewers read; editors and owners write.
create policy projects_select on public.projects
  for select to authenticated
  using (app.has_role(workspace_id, 'viewer'));
create policy projects_insert on public.projects
  for insert to authenticated
  with check (app.has_role(workspace_id, 'editor') and created_by = (select auth.uid()));
create policy projects_update on public.projects
  for update to authenticated
  using (app.has_role(workspace_id, 'editor'))
  with check (app.has_role(workspace_id, 'editor'));
create policy projects_delete on public.projects
  for delete to authenticated
  using (app.has_role(workspace_id, 'editor'));

create policy notes_select on public.notes
  for select to authenticated
  using (app.has_role(workspace_id, 'viewer'));
create policy notes_insert on public.notes
  for insert to authenticated
  with check (app.has_role(workspace_id, 'editor') and created_by = (select auth.uid()));
create policy notes_update on public.notes
  for update to authenticated
  using (app.has_role(workspace_id, 'editor'))
  with check (app.has_role(workspace_id, 'editor'));
create policy notes_delete on public.notes
  for delete to authenticated
  using (app.has_role(workspace_id, 'editor'));

-- summaries: viewers read; editors create. Immutable once written.
create policy project_summaries_select on public.project_summaries
  for select to authenticated
  using (app.has_role(workspace_id, 'viewer'));
create policy project_summaries_insert on public.project_summaries
  for insert to authenticated
  with check (app.has_role(workspace_id, 'editor') and created_by = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Grants: nothing for anon; minimal, column-level for authenticated.
-- Tenant keys (workspace_id, project_id) and authorship are not updatable.
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

grant select on public.users to authenticated;

grant select, update (name) on public.workspaces to authenticated;

grant select, delete on public.memberships to authenticated;
grant insert (workspace_id, user_id, role) on public.memberships to authenticated;
grant update (role) on public.memberships to authenticated;

grant select, delete on public.projects to authenticated;
grant insert (workspace_id, name, description) on public.projects to authenticated;
grant update (name, description) on public.projects to authenticated;

grant select, delete on public.notes to authenticated;
grant insert (workspace_id, project_id, title, body) on public.notes to authenticated;
grant update (title, body) on public.notes to authenticated;

grant select on public.project_summaries to authenticated;
grant insert (workspace_id, project_id, summary, key_points, cited_note_ids, flags, model, prompt_version, attempts)
  on public.project_summaries to authenticated;

-- -----------------------------------------------------------------------------
-- RPCs for operations that need to cross the RLS boundary in a controlled way.
-- Errors never distinguish "doesn't exist" from "not a member".
-- -----------------------------------------------------------------------------

create function public.create_workspace(p_name text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  ws  uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  insert into public.workspaces (name, created_by) values (p_name, uid) returning id into ws;
  insert into public.memberships (workspace_id, user_id, role) values (ws, uid, 'owner');
  return ws;
end
$$;

-- Owners add an existing user by email (or change their role).
create function public.invite_member(p_workspace_id uuid, p_email text, p_role public.member_role)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if not app.has_role(p_workspace_id, 'viewer') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not app.has_role(p_workspace_id, 'owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select id into target from public.users where email = lower(trim(p_email));
  if target is null then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  insert into public.memberships (workspace_id, user_id, role)
  values (p_workspace_id, target, p_role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
end
$$;

revoke all on function public.create_workspace(text)                                   from public, anon;
revoke all on function public.invite_member(uuid, text, public.member_role)            from public, anon;
grant execute on function public.create_workspace(text)                                to authenticated;
grant execute on function public.invite_member(uuid, text, public.member_role)         to authenticated;
