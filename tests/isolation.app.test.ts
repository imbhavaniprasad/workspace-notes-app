/**
 * Edge cases 1 + 2: a user in workspace A tampers with ids in the URL or the
 * request body. These call the same data-layer functions the pages and server
 * actions call, with the ids an attacker would substitute.
 *
 * Every attempt must fail with exactly the same result as an id that does not
 * exist at all, so the response reveals nothing about workspace B.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNote, deleteNote, listNotes, updateNote } from '@/lib/data/notes';
import { createProject, deleteProject, getProject, listProjects, updateProject } from '@/lib/data/projects';
import { getWorkspaceAccess, inviteMember, listMembers } from '@/lib/data/workspaces';
import { admin, createTenantFixture, type Fixture } from './helpers';

const NOT_FOUND = { ok: false, code: 'not_found', message: 'Not found.' };

let f: Fixture;
beforeAll(async () => {
  f = await createTenantFixture();
});
afterAll(async () => {
  await f?.cleanup();
});

describe('URL tampering (page loads)', () => {
  it('cannot open workspace B, and the result equals a non-existent workspace', async () => {
    const real = await getWorkspaceAccess(f.ownerA, f.wsB);
    const fake = await getWorkspaceAccess(f.ownerA, randomUUID());
    expect(real).toEqual(NOT_FOUND);
    expect(real).toEqual(fake);
  });

  it('cannot list projects, members or notes of workspace B', async () => {
    expect(await listProjects(f.ownerA, f.wsB)).toEqual(NOT_FOUND);
    expect(await listMembers(f.ownerA, f.wsB)).toEqual(NOT_FOUND);
    expect(await listNotes(f.ownerA, f.wsB, f.projectB.id)).toEqual(NOT_FOUND);
  });

  it("cannot read B's project via B's URL, or by putting B's project id under A's workspace", async () => {
    expect(await getProject(f.ownerA, f.wsB, f.projectB.id)).toEqual(NOT_FOUND);
    expect(await getProject(f.ownerA, f.wsA, f.projectB.id)).toEqual(NOT_FOUND);
    expect(await listNotes(f.ownerA, f.wsA, f.projectB.id)).toEqual(NOT_FOUND);
    expect(await getProject(f.ownerA, f.wsA, randomUUID())).toEqual(NOT_FOUND);
  });

  it('treats malformed ids the same as unknown ones', async () => {
    expect(await getWorkspaceAccess(f.ownerA, 'not-a-uuid')).toEqual(NOT_FOUND);
    expect(await getProject(f.ownerA, f.wsA, "' or 1=1 --")).toEqual(NOT_FOUND);
  });
});

describe('request body tampering (server actions)', () => {
  it("cannot update B's project, from either workspace id", async () => {
    expect(await updateProject(f.ownerA, f.wsB, f.projectB.id, { name: 'pwned' })).toEqual(NOT_FOUND);
    expect(await updateProject(f.ownerA, f.wsA, f.projectB.id, { name: 'pwned' })).toEqual(NOT_FOUND);
  });

  it("cannot delete B's project", async () => {
    expect(await deleteProject(f.ownerA, f.wsB, f.projectB.id)).toEqual(NOT_FOUND);
    expect(await deleteProject(f.ownerA, f.wsA, f.projectB.id)).toEqual(NOT_FOUND);
  });

  it('cannot create a project in B', async () => {
    expect(await createProject(f.ownerA, f.wsB, { name: 'planted' })).toEqual(NOT_FOUND);
  });

  it("cannot create, update or delete notes in B's project", async () => {
    expect(await createNote(f.ownerA, f.wsB, f.projectB.id, { title: 'planted' })).toEqual(NOT_FOUND);
    // A's workspace id + B's project id: the classic "mix and match" attack.
    expect(await createNote(f.ownerA, f.wsA, f.projectB.id, { title: 'planted' })).toEqual(NOT_FOUND);
    expect(await updateNote(f.ownerA, f.wsB, f.projectB.id, f.noteB.id, { title: 'pwned' })).toEqual(NOT_FOUND);
    expect(await updateNote(f.ownerA, f.wsA, f.projectA.id, f.noteB.id, { title: 'pwned' })).toEqual(NOT_FOUND);
    expect(await deleteNote(f.ownerA, f.wsA, f.projectA.id, f.noteB.id)).toEqual(NOT_FOUND);
    expect(await deleteNote(f.ownerA, f.wsB, f.projectB.id, f.noteB.id)).toEqual(NOT_FOUND);
  });

  it('cannot invite themselves into B', async () => {
    expect(await inviteMember(f.ownerA, f.wsB, { email: f.ownerA.email, role: 'owner' })).toEqual(NOT_FOUND);
  });

  it("left B's data untouched", async () => {
    const db = admin();
    const project = await db.from('projects').select('name').eq('id', f.projectB.id).single();
    const notes = await db.from('notes').select('title').eq('project_id', f.projectB.id);
    const members = await db.from('memberships').select('user_id').eq('workspace_id', f.wsB);
    expect(project.data?.name).toBe('B project');
    expect(notes.data).toEqual([{ title: 'B note' }]);
    expect(members.data).toEqual([{ user_id: f.ownerB.userId }]);
  });
});
