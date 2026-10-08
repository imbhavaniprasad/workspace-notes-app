import { redirect } from 'next/navigation';
import { signOutAction } from '@/app/actions';
import { requireCtx } from '@/lib/auth';
import { listMyWorkspaces } from '@/lib/data/workspaces';

export default async function Home() {
  const ctx = await requireCtx();
  const workspaces = await listMyWorkspaces(ctx);
  if (!workspaces.ok) throw new Error(workspaces.message);
  if (workspaces.data.length > 0) redirect(`/w/${workspaces.data[0].id}`);

  return (
    <main className="narrow stack">
      <h1>No workspaces yet</h1>
      <p className="muted">Signed in as {ctx.email}. Ask a workspace owner to add you.</p>
      <form action={signOutAction}>
        <button className="btn btn-plain">Sign out</button>
      </form>
    </main>
  );
}
