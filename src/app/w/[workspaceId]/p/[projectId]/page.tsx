import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  createNoteAction,
  deleteNoteAction,
  deleteProjectAction,
  summarizeAction,
  updateNoteAction,
  updateProjectAction,
} from '@/app/actions';
import { ActionForm } from '@/components/ActionForm';
import { SummarizeForm } from '@/components/SummarizeForm';
import { requireCtx } from '@/lib/auth';
import { listNotes } from '@/lib/data/notes';
import { getProject } from '@/lib/data/projects';
import { can, getWorkspaceAccess } from '@/lib/data/workspaces';
import { MOCK_SCENARIOS } from '@/lib/summary';
import { getLatestSummary, INJECTION_FLAG } from '@/lib/summary/summarize';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const ctx = await requireCtx();

  const access = await getWorkspaceAccess(ctx, workspaceId);
  if (!access.ok) notFound();
  const project = await getProject(ctx, access.data.id, projectId);
  if (!project.ok) {
    if (project.code === 'not_found') notFound();
    throw new Error(project.message);
  }

  const [notes, summary] = await Promise.all([
    listNotes(ctx, access.data.id, project.data.id),
    getLatestSummary(ctx, access.data.id, project.data.id),
  ]);
  if (!notes.ok) throw new Error(notes.message);
  if (!summary.ok) throw new Error(summary.message);

  const editor = can(access.data.role, 'editor');
  const ids = { workspaceId: access.data.id, projectId: project.data.id };

  return (
    <div className="grid">
      <section className="stack">
        <p>
          <Link href={`/w/${access.data.id}`}>&larr; {access.data.name}</Link>
        </p>
        <h1>{project.data.name}</h1>
        {project.data.description && <p className="muted">{project.data.description}</p>}

        {editor && (
          <details className="card">
            <summary>Edit project</summary>
            <ActionForm action={updateProjectAction} submitLabel="Save" pendingLabel="Saving..." hidden={ids}>
              <input name="name" defaultValue={project.data.name} required maxLength={200} />
              <textarea name="description" defaultValue={project.data.description} maxLength={2000} rows={2} />
            </ActionForm>
            <ActionForm
              action={deleteProjectAction}
              submitLabel="Delete project"
              pendingLabel="Deleting..."
              variant="danger"
              hidden={ids}
            />
          </details>
        )}

        <h2>Notes</h2>
        {notes.data.length === 0 && <p className="muted">No notes yet.</p>}
        <ul className="list">
          {notes.data.map((n) => (
            <li key={n.id} className="card stack-tight">
              <strong>{n.title}</strong>
              {/* Rendered as text: React escapes it, no HTML/markdown interpretation. */}
              <p className="note-body">{n.body}</p>
              {editor && (
                <details>
                  <summary>Edit</summary>
                  <ActionForm
                    action={updateNoteAction}
                    submitLabel="Save note"
                    pendingLabel="Saving..."
                    hidden={{ ...ids, noteId: n.id }}
                  >
                    <input name="title" defaultValue={n.title} required maxLength={200} />
                    <textarea name="body" defaultValue={n.body} maxLength={10000} rows={4} />
                  </ActionForm>
                  <ActionForm
                    action={deleteNoteAction}
                    submitLabel="Delete note"
                    pendingLabel="Deleting..."
                    variant="danger"
                    hidden={{ ...ids, noteId: n.id }}
                  />
                </details>
              )}
            </li>
          ))}
        </ul>

        {editor && (
          <details className="card" open={notes.data.length === 0}>
            <summary>New note</summary>
            <ActionForm
              action={createNoteAction}
              submitLabel="Add note"
              pendingLabel="Adding..."
              hidden={ids}
              resetOnSuccess
            >
              <input name="title" placeholder="Title" required maxLength={200} />
              <textarea name="body" placeholder="Write something..." maxLength={10000} rows={4} />
            </ActionForm>
          </details>
        )}
      </section>

      <aside className="stack">
        <h2>AI summary</h2>
        {summary.data ? (
          <div className="card stack-tight">
            {summary.data.flags.includes(INJECTION_FLAG) && (
              <p className="warning">
                Some notes contain text that looks like instructions to an AI. They were treated as data.
              </p>
            )}
            <p>{summary.data.summary}</p>
            {summary.data.key_points.length > 0 && (
              <ul>
                {summary.data.key_points.map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            )}
            <p className="muted small">
              {summary.data.model} · {summary.data.attempts} attempt(s) ·{' '}
              {new Date(summary.data.created_at).toLocaleString()}
            </p>
          </div>
        ) : (
          <p className="muted">No summary yet.</p>
        )}

        {editor ? (
          <SummarizeForm action={summarizeAction} hidden={ids} scenarios={MOCK_SCENARIOS} />
        ) : (
          <p className="muted small">Editors can generate summaries.</p>
        )}
      </aside>
    </div>
  );
}
