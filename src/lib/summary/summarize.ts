import { fromDbError } from '@/lib/data/errors';
import { listNotes } from '@/lib/data/notes';
import { getProject } from '@/lib/data/projects';
import { fail, ok, type Ctx, type Result } from '@/lib/data/types';
import { getWorkspaceAccess } from '@/lib/data/workspaces';
import { looksLikeInjection } from './injection';
import { buildRepairPrompt, buildSummaryPrompt, PROMPT_VERSION } from './prompt';
import type { SummaryProvider } from './provider';
import { parseModelOutput } from './schema';

export type StoredSummary = {
  id: string;
  summary: string;
  key_points: string[];
  cited_note_ids: string[];
  flags: string[];
  model: string;
  attempts: number;
  created_at: string;
};
const COLUMNS = 'id, summary, key_points, cited_note_ids, flags, model, attempts, created_at';

export type AttemptLog = { attempt: number; outcome: 'accepted' | 'rejected' | 'error'; detail: string };

export const INJECTION_FLAG = 'prompt_injection_suspected';

export async function getLatestSummary(
  ctx: Ctx,
  workspaceId: unknown,
  projectId: unknown,
): Promise<Result<StoredSummary | null>> {
  const project = await getProject(ctx, workspaceId, projectId);
  if (!project.ok) return project;
  const { data, error } = await ctx.db
    .from('project_summaries')
    .select(COLUMNS)
    .eq('workspace_id', project.data.workspace_id)
    .eq('project_id', project.data.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return fromDbError(error, 'getLatestSummary');
  return ok(data);
}

/**
 * Summarize a project's notes with an LLM.
 *
 * Note text is untrusted: it is escaped into a data block. Model output is
 * untrusted: it must parse as JSON, match a strict schema and only cite note
 * ids we sent. Invalid output gets one repair retry; if that fails too, nothing
 * is stored. The model has no tools, so the worst a successful injection can do
 * is produce schema-valid text, which is rendered as plain text.
 */
export async function summarizeProject(
  ctx: Ctx,
  provider: SummaryProvider,
  workspaceId: unknown,
  projectId: unknown,
  { maxAttempts = 2 }: { maxAttempts?: number } = {},
): Promise<Result<{ summary: StoredSummary; log: AttemptLog[] }> & { log?: AttemptLog[] }> {
  const access = await getWorkspaceAccess(ctx, workspaceId, 'editor');
  if (!access.ok) return access;
  const project = await getProject(ctx, access.data.id, projectId);
  if (!project.ok) return project;
  const notes = await listNotes(ctx, access.data.id, project.data.id);
  if (!notes.ok) return notes;
  if (notes.data.length === 0) return fail('invalid', 'Add at least one note before summarizing.');

  const noteIds = notes.data.map((n) => n.id);
  const request = buildSummaryPrompt(project.data.name, notes.data);
  const log: AttemptLog[] = [];

  let next = request;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let raw: string;
    try {
      raw = await provider.complete(next);
    } catch (e) {
      log.push({ attempt, outcome: 'error', detail: 'model call failed' });
      console.error('[summary] provider error', e);
      continue;
    }

    const parsed = parseModelOutput(raw, noteIds);
    if (!parsed.ok) {
      log.push({ attempt, outcome: 'rejected', detail: parsed.detail });
      console.warn(`[summary] attempt ${attempt} rejected: ${parsed.reason} (${parsed.detail})`);
      next = buildRepairPrompt(request, parsed.detail);
      continue;
    }

    log.push({ attempt, outcome: 'accepted', detail: 'valid output' });
    const flags = notes.data.some((n) => looksLikeInjection(`${n.title} ${n.body}`)) ? [INJECTION_FLAG] : [];

    const { data, error } = await ctx.db
      .from('project_summaries')
      .insert({
        workspace_id: access.data.id,
        project_id: project.data.id,
        summary: parsed.value.summary,
        key_points: parsed.value.keyPoints,
        cited_note_ids: parsed.value.citedNoteIds,
        flags,
        model: provider.model,
        prompt_version: PROMPT_VERSION,
        attempts: attempt,
      })
      .select(COLUMNS)
      .single();
    if (error) return fromDbError(error, 'summarizeProject');
    return ok({ summary: data, log });
  }

  return { ...fail('unavailable', `The model returned invalid output ${maxAttempts} times. Nothing was saved.`), log };
}
