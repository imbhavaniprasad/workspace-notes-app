import { fromDbError } from './errors';
import { getProject } from './projects';
import { fail, ok, type Ctx, type Result } from './types';
import { id as idSchema, noteInput } from './validation';
import { getWorkspaceAccess } from './workspaces';

export type Note = { id: string; project_id: string; title: string; body: string; updated_at: string };
const COLUMNS = 'id, project_id, title, body, updated_at';

export async function listNotes(ctx: Ctx, workspaceId: unknown, projectId: unknown): Promise<Result<Note[]>> {
  const project = await getProject(ctx, workspaceId, projectId);
  if (!project.ok) return project;
  const { data, error } = await ctx.db
    .from('notes')
    .select(COLUMNS)
    .eq('workspace_id', project.data.workspace_id)
    .eq('project_id', project.data.id)
    .order('created_at');
  if (error) return fromDbError(error, 'listNotes');
  return ok(data);
}

export async function createNote(
  ctx: Ctx,
  workspaceId: unknown,
  projectId: unknown,
  input: unknown,
): Promise<Result<Note>> {
  const access = await getWorkspaceAccess(ctx, workspaceId, 'editor');
  if (!access.ok) return access;
  const project = await getProject(ctx, access.data.id, projectId);
  if (!project.ok) return project;
  const parsed = noteInput.safeParse(input);
  if (!parsed.success) return fail('invalid', parsed.error.issues[0]?.message);

  const { data, error } = await ctx.db
    .from('notes')
    .insert({ workspace_id: access.data.id, project_id: project.data.id, ...parsed.data })
    .select(COLUMNS)
    .single();
  if (error) return fromDbError(error, 'createNote');
  return ok(data);
}

export async function updateNote(
  ctx: Ctx,
  workspaceId: unknown,
  projectId: unknown,
  noteId: unknown,
  input: unknown,
): Promise<Result<Note>> {
  const access = await getWorkspaceAccess(ctx, workspaceId, 'editor');
  if (!access.ok) return access;
  const pId = idSchema.safeParse(projectId);
  const nId = idSchema.safeParse(noteId);
  if (!pId.success || !nId.success) return fail('not_found');
  const parsed = noteInput.safeParse(input);
  if (!parsed.success) return fail('invalid', parsed.error.issues[0]?.message);

  const { data, error } = await ctx.db
    .from('notes')
    .update(parsed.data)
    .eq('workspace_id', access.data.id)
    .eq('project_id', pId.data)
    .eq('id', nId.data)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return fromDbError(error, 'updateNote');
  return data ? ok(data) : fail('not_found');
}

export async function deleteNote(
  ctx: Ctx,
  workspaceId: unknown,
  projectId: unknown,
  noteId: unknown,
): Promise<Result<null>> {
  const access = await getWorkspaceAccess(ctx, workspaceId, 'editor');
  if (!access.ok) return access;
  const pId = idSchema.safeParse(projectId);
  const nId = idSchema.safeParse(noteId);
  if (!pId.success || !nId.success) return fail('not_found');

  const { data, error } = await ctx.db
    .from('notes')
    .delete()
    .eq('workspace_id', access.data.id)
    .eq('project_id', pId.data)
    .eq('id', nId.data)
    .select('id');
  if (error) return fromDbError(error, 'deleteNote');
  return data.length ? ok(null) : fail('not_found');
}
