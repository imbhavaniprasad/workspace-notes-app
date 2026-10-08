import { fromDbError } from './errors';
import { fail, ok, type Ctx, type Result } from './types';
import { id as idSchema, projectInput } from './validation';
import { getWorkspaceAccess } from './workspaces';

export type Project = { id: string; workspace_id: string; name: string; description: string; updated_at: string };
const COLUMNS = 'id, workspace_id, name, description, updated_at';

export async function listProjects(ctx: Ctx, workspaceId: unknown): Promise<Result<Project[]>> {
  const access = await getWorkspaceAccess(ctx, workspaceId);
  if (!access.ok) return access;
  const { data, error } = await ctx.db
    .from('projects')
    .select(COLUMNS)
    .eq('workspace_id', access.data.id)
    .order('created_at', { ascending: false });
  if (error) return fromDbError(error, 'listProjects');
  return ok(data);
}

/** Both ids must match: a project id from workspace B under workspace A's URL is not_found. */
export async function getProject(ctx: Ctx, workspaceId: unknown, projectId: unknown): Promise<Result<Project>> {
  const access = await getWorkspaceAccess(ctx, workspaceId);
  if (!access.ok) return access;
  const pId = idSchema.safeParse(projectId);
  if (!pId.success) return fail('not_found');

  const { data, error } = await ctx.db
    .from('projects')
    .select(COLUMNS)
    .eq('workspace_id', access.data.id)
    .eq('id', pId.data)
    .maybeSingle();
  if (error) return fromDbError(error, 'getProject');
  return data ? ok(data) : fail('not_found');
}

export async function createProject(ctx: Ctx, workspaceId: unknown, input: unknown): Promise<Result<Project>> {
  const access = await getWorkspaceAccess(ctx, workspaceId, 'editor');
  if (!access.ok) return access;
  const parsed = projectInput.safeParse(input);
  if (!parsed.success) return fail('invalid', parsed.error.issues[0]?.message);

  const { data, error } = await ctx.db
    .from('projects')
    .insert({ workspace_id: access.data.id, ...parsed.data })
    .select(COLUMNS)
    .single();
  if (error) return fromDbError(error, 'createProject');
  return ok(data);
}

export async function updateProject(
  ctx: Ctx,
  workspaceId: unknown,
  projectId: unknown,
  input: unknown,
): Promise<Result<Project>> {
  const access = await getWorkspaceAccess(ctx, workspaceId, 'editor');
  if (!access.ok) return access;
  const pId = idSchema.safeParse(projectId);
  if (!pId.success) return fail('not_found');
  const parsed = projectInput.safeParse(input);
  if (!parsed.success) return fail('invalid', parsed.error.issues[0]?.message);

  // Zero rows updated (wrong workspace, someone else's row) => not_found.
  const { data, error } = await ctx.db
    .from('projects')
    .update(parsed.data)
    .eq('workspace_id', access.data.id)
    .eq('id', pId.data)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return fromDbError(error, 'updateProject');
  return data ? ok(data) : fail('not_found');
}

export async function deleteProject(ctx: Ctx, workspaceId: unknown, projectId: unknown): Promise<Result<null>> {
  const access = await getWorkspaceAccess(ctx, workspaceId, 'editor');
  if (!access.ok) return access;
  const pId = idSchema.safeParse(projectId);
  if (!pId.success) return fail('not_found');

  const { data, error } = await ctx.db
    .from('projects')
    .delete()
    .eq('workspace_id', access.data.id)
    .eq('id', pId.data)
    .select('id');
  if (error) return fromDbError(error, 'deleteProject');
  return data.length ? ok(null) : fail('not_found');
}
