import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { signOutAction } from '@/app/actions';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { requireCtx } from '@/lib/auth';
import { getWorkspaceAccess, listMyWorkspaces } from '@/lib/data/workspaces';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const ctx = await requireCtx();

  const [access, workspaces] = await Promise.all([getWorkspaceAccess(ctx, workspaceId), listMyWorkspaces(ctx)]);
  // Not a member and doesn't exist look identical.
  if (!access.ok) notFound();
  if (!workspaces.ok) throw new Error(workspaces.message);

  return (
    <>
      <header className="topbar">
        <Link href={`/w/${access.data.id}`} className="brand">
          Workspace Notes
        </Link>
        <WorkspaceSwitcher current={access.data.id} workspaces={workspaces.data} />
        <span className="spacer" />
        <span className="muted">
          {ctx.email} · <span className={`badge badge-${access.data.role}`}>{access.data.role}</span>
        </span>
        <form action={signOutAction}>
          <button className="btn btn-plain">Sign out</button>
        </form>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
