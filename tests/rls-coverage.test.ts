/**
 * Guard rails on the schema itself. If someone adds a table and forgets RLS,
 * forgets FORCE, forgets policies, or grants the anonymous role access, this
 * fails, so a policy mistake is caught before it can leak anything.
 */
import { describe, expect, it } from 'vitest';
import { sql } from './helpers';

describe('RLS coverage', () => {
  it('every table in public has RLS enabled and forced, and at least one policy', async () => {
    const rows = await sql<{ table: string; rls: boolean; forced: boolean; policies: number }>(`
      select c.relname as table, c.relrowsecurity as rls, c.relforcerowsecurity as forced,
             (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by 1`);

    expect(rows.map((r) => r.table)).toEqual(
      expect.arrayContaining(['memberships', 'notes', 'project_summaries', 'projects', 'users', 'workspaces']),
    );
    for (const r of rows) {
      expect(r, `table ${r.table}`).toMatchObject({ rls: true, forced: true });
      expect(r.policies, `policies on ${r.table}`).toBeGreaterThan(0);
    }
  });

  it('no policy grants access unconditionally', async () => {
    const rows = await sql<{ policyname: string }>(`
      select policyname from pg_policies
      where schemaname = 'public'
        and (coalesce(qual, '') in ('true', '(true)') or coalesce(with_check, '') in ('true', '(true)'))`);
    expect(rows).toEqual([]);
  });

  it('every policy applies only to authenticated users', async () => {
    const rows = await sql<{ policyname: string; roles: string }>(`
      select policyname, roles::text from pg_policies
      where schemaname = 'public' and roles <> '{authenticated}'`);
    expect(rows).toEqual([]);
  });

  it('the anon role has no privileges on any public table', async () => {
    const rows = await sql(`
      select table_name, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon'`);
    expect(rows).toEqual([]);
  });

  it('tenant keys cannot be updated by the API role', async () => {
    const rows = await sql<{ table_name: string; column_name: string }>(`
      select table_name, column_name from information_schema.column_privileges
      where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'UPDATE'
        and column_name in ('id', 'workspace_id', 'project_id', 'user_id', 'created_by')`);
    expect(rows).toEqual([]);
  });

  it('SECURITY DEFINER functions pin search_path', async () => {
    const rows = await sql<{ fn: string }>(`
      select n.nspname || '.' || p.proname as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'app') and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')`);
    expect(rows).toEqual([]);
  });
});
