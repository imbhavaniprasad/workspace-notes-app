/**
 * Roles inside one workspace: viewers read, editors write, owners also invite.
 * Checked at the app layer (clear "forbidden" error for members) and again
 * directly against the Data API (RLS enforces the same rule).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNote, listNotes, updateNote } from '@/lib/data/notes';
import { createProject, deleteProject, listProjects, updateProject } from '@/lib/data/projects';
import { inviteMember, listMembers } from '@/lib/data/workspaces';
import { createTenantFixture, createUser, type Fixture } from './helpers';

const FORBIDDEN = { ok: false, code: 'forbidden', message: 'Your role does not allow this action.' };

let f: Fixture;
beforeAll(async () => {
  f = await createTenantFixture();
});
afterAll(async () => {
  await f?.cleanup();
});

describe('viewer', () => {
  it('can read projects, notes and members', async () => {
    expect((await listProjects(f.viewerA, f.wsA)).ok).toBe(true);
    expect((await listNotes(f.viewerA, f.wsA, f.projectA.id)).ok).toBe(true);
    expect((await listMembers(f.viewerA, f.wsA)).ok).toBe(true);
  });

  it('cannot create, edit or delete (app layer)', async () => {
    expect(await createProject(f.viewerA, f.wsA, { name: 'nope' })).toEqual(FORBIDDEN);
    expect(await updateProject(f.viewerA, f.wsA, f.projectA.id, { name: 'nope' })).toEqual(FORBIDDEN);
    expect(await deleteProject(f.viewerA, f.wsA, f.projectA.id)).toEqual(FORBIDDEN);
    expect(await createNote(f.viewerA, f.wsA, f.projectA.id, { title: 'nope' })).toEqual(FORBIDDEN);
    expect(await updateNote(f.viewerA, f.wsA, f.projectA.id, f.noteA.id, { title: 'nope' })).toEqual(FORBIDDEN);
  });

  it('cannot write directly through the Data API either (RLS)', async () => {
    const db = f.viewerA.db;
    expect((await db.from('projects').insert({ workspace_id: f.wsA, name: 'nope' })).error?.code).toBe('42501');
    expect((await db.from('projects').update({ name: 'nope' }).eq('id', f.projectA.id).select()).data).toEqual([]);
    expect((await db.from('notes').delete().eq('id', f.noteA.id).select()).data).toEqual([]);
  });
});

describe('editor', () => {
  it('can create and edit projects and notes', async () => {
    const p = await createProject(f.editorA, f.wsA, { name: 'Editor project' });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect((await updateProject(f.editorA, f.wsA, p.data.id, { name: 'Renamed' })).ok).toBe(true);
    const n = await createNote(f.editorA, f.wsA, p.data.id, { title: 'Editor note' });
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    expect((await updateNote(f.editorA, f.wsA, p.data.id, n.data.id, { title: 'Edited' })).ok).toBe(true);
  });

  it('cannot invite members (app layer and RPC)', async () => {
    const outsider = await createUser('outsider');
    expect(await inviteMember(f.editorA, f.wsA, { email: outsider.email, role: 'viewer' })).toEqual(FORBIDDEN);
    const rpc = await f.editorA.db.rpc('invite_member', { p_workspace_id: f.wsA, p_email: outsider.email, p_role: 'viewer' });
    expect(rpc.error?.message).toBe('forbidden');
  });

  it('cannot promote itself to owner via the Data API', async () => {
    const res = await f.editorA.db
      .from('memberships')
      .update({ role: 'owner' })
      .eq('workspace_id', f.wsA)
      .eq('user_id', f.editorA.userId)
      .select();
    expect(res.data).toEqual([]);
  });
});

describe('owner', () => {
  it('can invite members', async () => {
    const newcomer = await createUser('newcomer');
    expect((await inviteMember(f.ownerA, f.wsA, { email: newcomer.email, role: 'viewer' })).ok).toBe(true);
    expect((await listProjects(newcomer, f.wsA)).ok).toBe(true);
  });

  it('gets a clear error for unknown emails', async () => {
    const res = await inviteMember(f.ownerA, f.wsA, { email: 'nobody@nowhere.test', role: 'viewer' });
    expect(res).toMatchObject({ ok: false, code: 'invalid' });
  });
});
