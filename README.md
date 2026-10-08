# Workspace Notes

A small multi-tenant app: **workspaces** contain **projects**, projects contain **notes**. Users belong to workspaces as `owner`, `editor` or `viewer`. Data never leaks between workspaces, and that guarantee lives in **Postgres row-level security**, not only in application code.

Stack: TypeScript, Next.js 16 (App Router, Server Components, Server Actions), Supabase (Postgres 17 + Auth) running locally in Docker, zod, Vitest.

> Screen recording: _link to be added_

---

## Run it

Prerequisites: Node 20+, Docker Desktop running. No Supabase account or API keys are needed: everything runs locally.

```bash
npm install
npx supabase start      # Postgres, Auth, API and Studio in Docker; applies migrations + seed
npm run env             # writes .env.local from `supabase status`
npm run dev             # http://localhost:3000
```

| What | Where |
| --- | --- |
| App | http://localhost:3000 |
| Supabase Studio (DB UI) | http://localhost:54323 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Reset the database to a clean seed at any time with `npm run db:reset`.

### Demo accounts (seed data, password `password123`)

| User | Acme | Globex |
| --- | --- | --- |
| alice@acme.test | owner | - |
| bob@acme.test | editor | viewer |
| carol@acme.test | viewer | - |
| dave@globex.test | - | owner |

The login page has one-click buttons that fill these in. Bob belongs to both workspaces, so use him to demo the workspace switcher.

Seed IDs are fixed and readable to make the tampering demo easy to follow (IDs created by the app are random UUIDs):

| | ID |
| --- | --- |
| Acme workspace | `11111111-1111-4111-8111-111111111111` |
| Globex workspace | `22222222-2222-4222-8222-222222222222` |
| Acme project "Website relaunch" | `a1111111-1111-4111-8111-111111111111` |
| Globex project "Secret merger" | `b1111111-1111-4111-8111-111111111111` |

## Run the tests

```bash
npm test
```

The tests run against the local Supabase stack (it must be running and `npm run env` must have been run). Each test file creates its own throwaway users and workspaces through the real Auth API and removes them afterwards, so the suite doesn't depend on, or change, the seed data.

| File | What it proves |
| --- | --- |
| `tests/isolation.app.test.ts` | A user in workspace A who changes workspace/project/note IDs **in the URL or the request body** gets `Not found.`, the exact same result as an ID that doesn't exist. B's data is verified unchanged. |
| `tests/isolation.db.test.ts` | The same attacks **directly against the database**, bypassing the app: via the Supabase Data API with A's valid JWT, and via raw SQL as role `authenticated`. Reads return nothing, updates/deletes affect 0 rows, inserts are rejected, and a query with no user context returns nothing at all. |
| `tests/roles.test.ts` | Viewers read only, editors write, only owners invite. Checked at the app layer and again directly against RLS. |
| `tests/rls-coverage.test.ts` | Guard rails on the schema: every table has RLS **enabled and forced** with at least one policy; no policy is `USING (true)`; `anon` has no table privileges; tenant keys aren't updatable; `SECURITY DEFINER` functions pin `search_path`. A future table added without RLS fails CI. |
| `tests/summary.unit.test.ts` | Output validation (malformed JSON, wrong shape, extra keys, hallucinated note IDs), prompt escaping, injection heuristic, mock scenarios. |
| `tests/summary.flow.test.ts` | End to end: malformed output once leads to one retry and a stored summary; an "ignore previous instructions" note is not obeyed, not cited, and flagged; a model that keeps obeying the injection leads to nothing stored; a throwing provider is handled. |

I also checked that the suite catches real mistakes: adding a policy `create policy oops on projects for select using (true)` makes 5 tests fail (`rls-coverage` plus the direct-database tests).

---

## How tenant isolation works

```
Browser ──cookie──▶ Next.js server ──user's JWT──▶ Supabase Data API ──▶ Postgres (RLS)
                   │                                                    │
                   │ getUser(): JWT verified by Auth server             │ auth.uid() from the verified JWT
                   │ data layer: membership + role check                │ policies: app.has_role(workspace_id, ...)
                   │ (friendly errors)                                  │ (the actual guarantee)
```

Two independent layers, and the database is the one that guarantees it:

1. **Postgres RLS (the guarantee).** Every table has `ENABLE` and `FORCE ROW LEVEL SECURITY`. Policies grant access only through `app.has_role(workspace_id, min_role)`, which checks the caller's membership using `auth.uid()` (the user ID from the verified JWT). There are no "allow all" policies.
2. **Data layer (clear errors).** `src/lib/data/*` checks membership and role first, so users get `Not found.` or `Your role does not allow this action.` instead of raw database errors. If this layer had a bug, RLS would still block the access. If RLS had a bug, this layer would still block it. The tests check each layer separately.

### Why a policy mistake denies rather than allows

- **RLS on and no matching policy means no rows.** Forgetting a policy hides data instead of exposing it.
- **`FORCE`** applies RLS to the table owner too.
- **No user context means no access:** `auth.uid()` is `NULL`, `has_role(...)` is false, and nothing is visible (tested).
- **Default privileges are revoked** for `anon`/`authenticated` in `public`, so a new table isn't even reachable until someone grants it explicitly. Grants are **column-level**: `workspace_id`, `project_id` and `created_by` can't be updated, so rows can't be moved between workspaces.
- **Composite foreign keys** (`notes(project_id, workspace_id) → projects(id, workspace_id)`) make it impossible for a note to belong to a project in another workspace, even for a buggy writer.
- **The `rls-coverage` test** fails if any of the above regresses.

### Never trusting client IDs

- The **user** comes only from the session: `requireCtx()` calls `supabase.auth.getUser()`, which has the Auth server verify the JWT. (`getSession()` only decodes the cookie and is never used for identity.)
- **Workspace/project/note IDs** from the URL or form body are treated as *requests*. They're validated as UUIDs and then the database decides whether this user can see them.
- **No existence oracle:** "doesn't exist", "belongs to another workspace", and "malformed ID" all return the same `Not found.` / 404 page. The tests assert the results are *equal*, not just both failures. `forbidden` is only returned to members, who already know the workspace exists.
- The app never uses the service-role key. It appears only in tests (to create throwaway users and verify state) and is never imported by `src/`.

### Roles

| | viewer | editor | owner |
| --- | :-: | :-: | :-: |
| Read workspace, projects, notes, members, summaries | ✓ | ✓ | ✓ |
| Create / edit / delete projects and notes, run summaries | | ✓ | ✓ |
| Invite members / change roles | | | ✓ |

Enforced by RLS policies and the `invite_member` function, mirrored in the data layer. The UI hides controls a role can't use, but that's cosmetic: the tests call the server directly.

---

## AI summary: "Summarize project"

`src/lib/summary/`

- **Provider interface:** `SummaryProvider.complete({ system, user }) → string`. `MockSummaryProvider` is deterministic and needs no keys. It reads the same prompt a real model would get, and has demo scenarios: `normal`, `malformed-once`, `compromised` (a model that obeys the injected note). A real provider is one class implementing the interface.
- **Note text is untrusted input.** It's HTML-escaped into a `<notes>` data block (a note can't close or forge the wrapper), truncated, and the system prompt says note content is data, never instructions. The model has **no tools**: the worst a successful injection can do is produce text.
- **Model output is untrusted too.** It must be JSON matching a **strict zod schema** (`summary` ≤ 1000 chars, ≤ 8 `keyPoints`, `citedNoteIds` must be UUIDs **that were in the input**). Unknown keys are rejected, not ignored.
- **Malformed output:** one retry with a short fixed repair message. If that fails too, **nothing is stored** and the user sees an error. The UI shows the attempt log (`Attempt 1: rejected (output was not valid JSON)`, `Attempt 2: accepted`).
- **Prompt injection:** the seed note "IGNORE PREVIOUS INSTRUCTIONS..." is summarized as content, not obeyed. A heuristic flags it, and the UI shows a warning. The heuristic is *not* the defense (keyword filters are easy to bypass); the structure above is.
- Summaries are stored with model, prompt version and attempt count, and rendered as plain text (React escaping, no `dangerouslySetInnerHTML`).

---

## Design decisions and trade-offs

| Decision | Why | Trade-off |
| --- | --- | --- |
| **Supabase (local) instead of hand-rolled Postgres + auth** | Auth is solved and secure. RLS reads the verified JWT through `auth.uid()`. The Data API makes the "direct database call" attack real and testable. | Some coupling to Supabase. The isolation itself is plain Postgres RLS; on plain Postgres, the same policies work by setting `set_config('request.jwt.claims', ..., true)` per transaction, which is exactly what PostgREST does. |
| **RLS as the source of truth, data layer for UX** | One forgotten `WHERE workspace_id = ...` in app code can't leak data. | Policies are another thing to test, hence the coverage test. Every query pays the policy cost, mitigated below. |
| **`SECURITY DEFINER` helper `app.has_role()`** in a non-exposed `app` schema | Avoids recursive RLS on `memberships`, keeps policies one-liners, `STABLE` so it's evaluated once per statement. `(select auth.uid())` is cached per query. Indexed on `memberships(user_id, workspace_id)`. | Definer functions must be written carefully (`search_path` pinned and tested). |
| **Same `Not found.` for missing and foreign IDs** | No way to probe whether another tenant's workspace or project exists. | Slightly less helpful errors for legitimate typos. |
| **Invites only for existing users, by email** | Keeps scope small. | `invite_member` reveals to *owners* whether an email has an account. A production version would send a token-based email invite instead. |
| **Server Actions + Server Components, no client data fetching** | No data access code or keys in the browser (only the public key, which RLS makes safe). | Less interactivity (forms reload the segment). Fine here. |
| **Next.js Cache Components disabled** | Every page is per-user, tenant-scoped data, so nothing benefits from a static shell, and not caching tenant data removes a whole class of cross-tenant cache bugs. | Gives up prefetch/static-shell performance. `loading.tsx` still streams a loading state. |
| **Tests against a real local database** | RLS can't be meaningfully mocked. These tests exercise the real policies, grants and Auth. | Tests need Docker running. ~10s for the suite. |

Known nuance: because `loading.tsx` streams the page, a not-found *project* inside a workspace you belong to renders the Not found page with HTTP 200 (status is sent before the lookup finishes). The content is identical for foreign and non-existent IDs. A foreign *workspace* returns a real 404.

## What I'd do next

- Email/token-based invitations, member removal, and protecting the last owner from demoting themselves.
- Playwright end-to-end tests for the UI flows (the security logic is covered by the integration tests today).
- A real `SummaryProvider` (e.g. Anthropic) with timeouts, rate limiting per workspace, and summaries generated in a background job.
- Audit log table (who changed what, in which workspace), and soft deletes.
- pgTAP tests for policies inside the database, and a CI workflow running `supabase start` + `npm test` on every PR.
- Observability: structured logs with request IDs, and metrics on summary failures and retries.

---

## Project layout

```
supabase/
  migrations/20261008000000_init.sql   schema, RLS policies, grants, helper functions, RPCs
  seed.sql                             two workspaces, four users, an injection note
src/
  proxy.ts                             refreshes the auth cookie, optimistic redirect to /login
  lib/auth.ts                          requireCtx(): verified user from the session
  lib/data/                            data layer: workspaces, projects, notes (+ error mapping, validation)
  lib/summary/                         provider interface, mock, prompt, schema, summarize flow
  app/actions.ts                       server actions (thin: auth → data layer → revalidate)
  app/w/[workspaceId]/...              pages, loading and error states
tests/                                 isolation, roles, RLS coverage, summary
ai-log/                                complete AI session transcripts
```

## AI usage

I built this with AI assistance (Claude), planning the architecture together, then generating and reviewing code, and using the test suite plus deliberately planted bugs to check the result. The complete, unedited transcripts are in [`ai-log/`](ai-log/).
