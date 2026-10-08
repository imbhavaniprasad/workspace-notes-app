'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireCtx } from '@/lib/auth';
import { createNote, deleteNote, updateNote } from '@/lib/data/notes';
import { createProject, deleteProject, updateProject } from '@/lib/data/projects';
import type { Result } from '@/lib/data/types';
import { inviteMember } from '@/lib/data/workspaces';
import { getSummaryProvider } from '@/lib/summary';
import { summarizeProject, type AttemptLog } from '@/lib/summary/summarize';

/**
 * Server actions. Every id here arrives from the client (hidden form fields)
 * and is treated as an untrusted *request*: the user comes from the verified
 * session (requireCtx), and the data layer + RLS decide whether the ids are
 * reachable for that user. Tampered ids produce the same "Not found." as ids
 * that never existed.
 */

export type FormState = { ok?: boolean; error?: string; message?: string; at?: number; log?: AttemptLog[] };

const field = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === 'string' ? v : undefined;
};

function toState(result: Result<unknown>, message: string): FormState {
  return result.ok ? { ok: true, message, at: Date.now() } : { ok: false, error: result.message, at: Date.now() };
}

export async function createProjectAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  const ws = field(fd, 'workspaceId');
  const res = await createProject(ctx, ws, { name: field(fd, 'name'), description: field(fd, 'description') });
  if (res.ok) revalidatePath(`/w/${res.data.workspace_id}`);
  return toState(res, 'Project created.');
}

export async function updateProjectAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  const res = await updateProject(ctx, field(fd, 'workspaceId'), field(fd, 'projectId'), {
    name: field(fd, 'name'),
    description: field(fd, 'description'),
  });
  if (res.ok) revalidatePath(`/w/${res.data.workspace_id}`, 'layout');
  return toState(res, 'Project saved.');
}

export async function deleteProjectAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  const ws = field(fd, 'workspaceId');
  const res = await deleteProject(ctx, ws, field(fd, 'projectId'));
  if (!res.ok) return toState(res, '');
  revalidatePath(`/w/${ws}`);
  redirect(`/w/${ws}`);
}

export async function createNoteAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  const ws = field(fd, 'workspaceId');
  const pr = field(fd, 'projectId');
  const res = await createNote(ctx, ws, pr, { title: field(fd, 'title'), body: field(fd, 'body') });
  if (res.ok) revalidatePath(`/w/${ws}/p/${pr}`);
  return toState(res, 'Note added.');
}

export async function updateNoteAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  const ws = field(fd, 'workspaceId');
  const pr = field(fd, 'projectId');
  const res = await updateNote(ctx, ws, pr, field(fd, 'noteId'), { title: field(fd, 'title'), body: field(fd, 'body') });
  if (res.ok) revalidatePath(`/w/${ws}/p/${pr}`);
  return toState(res, 'Note saved.');
}

export async function deleteNoteAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  const ws = field(fd, 'workspaceId');
  const pr = field(fd, 'projectId');
  const res = await deleteNote(ctx, ws, pr, field(fd, 'noteId'));
  if (res.ok) revalidatePath(`/w/${ws}/p/${pr}`);
  return toState(res, 'Note deleted.');
}

export async function inviteMemberAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  const ws = field(fd, 'workspaceId');
  const res = await inviteMember(ctx, ws, { email: field(fd, 'email'), role: field(fd, 'role') });
  if (res.ok) revalidatePath(`/w/${ws}`);
  return toState(res, 'Member added.');
}

export async function summarizeAction(_: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireCtx();
  const ws = field(fd, 'workspaceId');
  const pr = field(fd, 'projectId');
  const provider = getSummaryProvider(field(fd, 'scenario'));
  const res = await summarizeProject(ctx, provider, ws, pr);
  if (res.ok) {
    revalidatePath(`/w/${ws}/p/${pr}`);
    return { ok: true, message: 'Summary saved.', at: Date.now(), log: res.data.log };
  }
  return { ok: false, error: res.message, at: Date.now(), log: res.log };
}

export async function signOutAction() {
  const ctx = await requireCtx();
  await ctx.db.auth.signOut();
  redirect('/login');
}
