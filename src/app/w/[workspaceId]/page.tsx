import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createProjectAction, inviteMemberAction } from '@/app/actions';
import { ActionForm } from '@/components/ActionForm';
import { requireCtx } from '@/lib/auth';
import { listProjects } from '@/lib/data/projects';
import { can, getWorkspaceAccess, listMembers } from '@/lib/data/workspaces';

export default async function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const ctx = await requireCtx();

  const access = await getWorkspaceAccess(ctx, workspaceId);
  if (!access.ok) notFound();
  const ws = access.data;

  const [projects, members] = await Promise.all([listProjects(ctx, ws.id), listMembers(ctx, ws.id)]);
  if (!projects.ok) throw new Error(projects.message);
  if (!members.ok) throw new Error(members.message);

  return (
    <div className="grid">
      <section className="stack">
        <h1>{ws.name}</h1>
        <h2>Projects</h2>
        {projects.data.length === 0 ? (
          <p className="muted">No projects yet.</p>
        ) : (
          <ul className="list">
            {projects.data.map((p) => (
              <li key={p.id} className="card">
                <Link href={`/w/${ws.id}/p/${p.id}`} className="title">
                  {p.name}
                </Link>
                {p.description && <p className="muted">{p.description}</p>}
              </li>
            ))}
          </ul>
        )}

        {can(ws.role, 'editor') ? (
          <details className="card">
            <summary>New project</summary>
            <ActionForm
              action={createProjectAction}
              submitLabel="Create project"
              pendingLabel="Creating..."
              hidden={{ workspaceId: ws.id }}
              resetOnSuccess
            >
              <input name="name" placeholder="Project name" required maxLength={200} />
              <textarea name="description" placeholder="Description (optional)" maxLength={2000} rows={2} />
            </ActionForm>
          </details>
        ) : (
          <p className="muted">You have read-only access to this workspace.</p>
        )}
      </section>

      <aside className="stack">
        <h2>Members</h2>
        <ul className="list">
          {members.data.map((m) => (
            <li key={m.userId} className="row">
              <span>{m.displayName}</span>
              <span className="muted">{m.email}</span>
              <span className={`badge badge-${m.role}`}>{m.role}</span>
            </li>
          ))}
        </ul>
        {can(ws.role, 'owner') && (
          <details className="card">
            <summary>Invite member</summary>
            <ActionForm
              action={inviteMemberAction}
              submitLabel="Add member"
              pendingLabel="Adding..."
              hidden={{ workspaceId: ws.id }}
              resetOnSuccess
            >
              <input name="email" type="email" placeholder="email@example.com" required />
              <select name="role" defaultValue="viewer">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="owner">Owner</option>
              </select>
            </ActionForm>
          </details>
        )}
      </aside>
    </div>
  );
}
