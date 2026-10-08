/**
 * Edge case 3: a user skips the app entirely and talks to the database.
 *
 *  - via the Supabase Data API with their own valid JWT (what any user can do
 *    with the public key from the browser bundle), and
 *  - via raw SQL as role `authenticated` with their JWT claims (what PostgREST
 *    does under the hood).
 *
 * No app code runs here: these prove that RLS alone isolates tenants.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, anonDb, asSqlUser, createTenantFixture, type Fixture } from './helpers';

let f: Fixture;
beforeAll(async () => {
  f = await createTenantFixture();
});
afterAll(async () => {
  await f?.cleanup();
});

describe('Data API with a valid JWT for workspace A', () => {
  it("sees nothing of B: not by listing, not by B's ids", async () => {
    const db = f.ownerA.db;
    const projects = await db.from('projects').select('id, workspace_id');
    expect(projects.data?.every((p) => p.workspace_id === f.wsA)).toBe(true);

    expect((await db.from('workspaces').select('*').eq('id', f.wsB)).data).toEqual([]);
    expect((await db.from('projects').select('*').eq('id', f.projectB.id)).data).toEqual([]);
    expect((await db.from('notes').select('*').eq('workspace_id', f.wsB)).data).toEqual([]);
    expect((await db.from('memberships').select('*').eq('workspace_id', f.wsB)).data).toEqual([]);
    expect((await db.from('users').select('*').eq('id', f.ownerB.userId)).data).toEqual([]);
  });

  it("an existing B id and a random id return identical responses (no existence oracle)", async () => {
    const db = f.ownerA.db;
    const real = await db.from('projects').select('*').eq('id', f.projectB.id);
    const fake = await db.from('projects').select('*').eq('id', randomUUID());
    expect({ data: real.data, error: real.error, status: real.status }).toEqual({
      data: fake.data,
      error: fake.error,
      status: fake.status,
    });
  });

  it("cannot update or delete B's rows (0 rows affected)", async () => {
    const db = f.ownerA.db;
    const upd = await db.from('projects').update({ name: 'pwned' }).eq('id', f.projectB.id).select();
    const del = await db.from('notes').delete().eq('id', f.noteB.id).select();
    expect(upd.data).toEqual([]);
    expect(del.data).toEqual([]);
  });

  it('cannot insert into B (RLS WITH CHECK rejects)', async () => {
    const db = f.ownerA.db;
    const project = await db.from('projects').insert({ workspace_id: f.wsB, name: 'planted' });
    expect(project.error?.code).toBe('42501');

    const membership = await db.from('memberships').insert({ workspace_id: f.wsB, user_id: f.ownerA.userId, role: 'owner' });
    expect(membership.error?.code).toBe('42501');
  });

  it("cannot attach a note in A to B's project (composite FK)", async () => {
    const res = await f.ownerA.db
      .from('notes')
      .insert({ workspace_id: f.wsA, project_id: f.projectB.id, title: 'planted' });
    expect(res.error).not.toBeNull();
  });

  it('cannot move its own project into another workspace (workspace_id is not updatable)', async () => {
    const res = await f.ownerA.db
      .from('projects')
      .update({ workspace_id: f.wsB } as never)
      .eq('id', f.projectA.id);
    expect(res.error?.code).toBe('42501');
  });

  it('cannot call invite_member for B', async () => {
    const res = await f.ownerA.db.rpc('invite_member', {
      p_workspace_id: f.wsB,
      p_email: f.ownerA.email,
      p_role: 'owner',
    });
    expect(res.error?.message).toBe('not_found');
  });

  it('B is unchanged', async () => {
    const db = admin();
    expect((await db.from('projects').select('name').eq('id', f.projectB.id).single()).data?.name).toBe('B project');
    expect((await db.from('notes').select('id').eq('id', f.noteB.id)).data).toHaveLength(1);
    expect((await db.from('projects').select('workspace_id').eq('id', f.projectA.id).single()).data?.workspace_id).toBe(
      f.wsA,
    );
  });
});

describe('Data API without a user', () => {
  it('anonymous requests get nothing', async () => {
    const res = await anonDb().from('projects').select('*');
    // anon has no table privileges at all
    expect(res.data ?? []).toEqual([]);
    expect(res.error?.code).toBe('42501');
  });
});

describe('raw SQL as role authenticated', () => {
  it('with A claims: only A rows are visible, B ids return nothing', async () => {
    await asSqlUser(f.ownerA.userId, async (c) => {
      const all = await c.query('select workspace_id from public.projects');
      expect(all.rows.every((r) => r.workspace_id === f.wsA)).toBe(true);
      expect((await c.query('select * from public.notes where id = $1', [f.noteB.id])).rowCount).toBe(0);
      expect((await c.query('delete from public.notes where id = $1', [f.noteB.id])).rowCount).toBe(0);
      expect((await c.query(`update public.projects set name = 'x' where id = $1`, [f.projectB.id])).rowCount).toBe(0);
    });
  });

  it('with no claims at all (forgotten context): fails closed, sees nothing', async () => {
    await asSqlUser(null, async (c) => {
      for (const table of ['workspaces', 'memberships', 'projects', 'notes', 'project_summaries', 'users']) {
        expect((await c.query(`select 1 from public.${table}`)).rowCount, table).toBe(0);
      }
    });
  });
});
