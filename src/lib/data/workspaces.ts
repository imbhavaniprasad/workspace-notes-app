import { fromDbError } from './errors';
import { fail, ok, type Ctx, type Result, type Role } from './types';
import { id as idSchema, inviteInput } from './validation';

export type WorkspaceAccess = { id: string; name: string; role: Role };

const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };
export const can = (role: Role, min: Role) => RANK[role] >= RANK[min];

export async function listMyWorkspaces(ctx: Ctx): Promise<Result<WorkspaceAccess[]>> {
  const { data, error } = await ctx.db
    .from('memberships')
    .select('role, workspace:workspaces!inner(id, name)')
    .eq('user_id', ctx.userId)
    .order('created_at');
  if (error) return fromDbError(error, 'listMyWorkspaces');
  return ok(data.map((m) => ({ id: m.workspace.id, name: m.workspace.name, role: m.role })));
}

/**
 * The single entry point for "may this user touch this workspace?".
 * A non-member gets not_found: exactly what a non-existent id returns.
 * A member below `min` gets forbidden (they already know the workspace exists).
 * RLS enforces the same rules again in Postgres; this layer is for clear errors.
 */
export async function getWorkspaceAccess(
  ctx: Ctx,
  workspaceId: unknown,
  min: Role = 'viewer',
): Promise<Result<WorkspaceAccess>> {
  const wsId = idSchema.safeParse(workspaceId);
  if (!wsId.success) return fail('not_found');

  const { data, error } = await ctx.db
    .from('memberships')
    .select('role, workspace:workspaces!inner(id, name)')
    .eq('workspace_id', wsId.data)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (error) return fromDbError(error, 'getWorkspaceAccess');
  if (!data) return fail('not_found');
  if (!can(data.role, min)) return fail('forbidden');
  return ok({ id: data.workspace.id, name: data.workspace.name, role: data.role });
}

export type Member = { userId: string; email: string; displayName: string; role: Role };

export async function listMembers(ctx: Ctx, workspaceId: unknown): Promise<Result<Member[]>> {
  const access = await getWorkspaceAccess(ctx, workspaceId);
  if (!access.ok) return access;

  const { data, error } = await ctx.db
    .from('memberships')
    .select('role, user:users!inner(id, email, display_name)')
    .eq('workspace_id', access.data.id)
    .order('created_at');
  if (error) return fromDbError(error, 'listMembers');
  return ok(
    data.map((m) => ({ userId: m.user.id, email: m.user.email, displayName: m.user.display_name, role: m.role })),
  );
}

export async function inviteMember(ctx: Ctx, workspaceId: unknown, input: unknown): Promise<Result<null>> {
  const access = await getWorkspaceAccess(ctx, workspaceId, 'owner');
  if (!access.ok) return access;
  const parsed = inviteInput.safeParse(input);
  if (!parsed.success) return fail('invalid', parsed.error.issues[0]?.message);

  const { error } = await ctx.db.rpc('invite_member', {
    p_workspace_id: access.data.id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error?.message === 'user_not_found') return fail('invalid', 'No user with that email has signed up yet.');
  if (error) return fromDbError(error, 'inviteMember');
  return ok(null);
}
