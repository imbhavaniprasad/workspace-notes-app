import { z } from 'zod';

/** The only shape we will store. strict(): unexpected keys are a rejection, not ignored. */
export const SummarySchema = z
  .object({
    summary: z.string().trim().min(1).max(1000),
    keyPoints: z.array(z.string().trim().min(1).max(300)).max(8),
    citedNoteIds: z.array(z.uuid()).max(50),
  })
  .strict();

export type Summary = z.infer<typeof SummarySchema>;

export type ParseResult =
  | { ok: true; value: Summary }
  | { ok: false; reason: 'not_json' | 'schema' | 'unknown_citation'; detail: string };

/**
 * Validates raw model text. Never throws. Rejects:
 *  - anything that isn't a single JSON object (a ```json fence is tolerated),
 *  - anything that doesn't match SummarySchema exactly,
 *  - citations of note ids that were not in the input (hallucinated or injected).
 */
export function parseModelOutput(raw: string, allowedNoteIds: readonly string[]): ParseResult {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not_json', detail: 'output was not valid JSON' };
  }

  const parsed = SummarySchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: 'schema', detail: `${issue?.path.join('.') || 'output'}: ${issue?.message}` };
  }

  const allowed = new Set(allowedNoteIds);
  const unknown = parsed.data.citedNoteIds.filter((id) => !allowed.has(id));
  if (unknown.length) {
    return { ok: false, reason: 'unknown_citation', detail: `cited ${unknown.length} note id(s) not in the input` };
  }

  return { ok: true, value: { ...parsed.data, citedNoteIds: [...new Set(parsed.data.citedNoteIds)] } };
}
