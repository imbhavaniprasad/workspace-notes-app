import { looksLikeInjection } from './injection';
import type { ModelRequest, SummaryProvider } from './provider';

/**
 * normal         - a well-behaved model: summarizes, treats injected text as data.
 * malformed-once - first reply is truncated JSON, later replies are normal.
 * compromised    - a model that obeys the injected note every time; its output
 *                  must be rejected by validation and nothing stored.
 */
export const MOCK_SCENARIOS = ['normal', 'malformed-once', 'compromised'] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

type ParsedNote = { id: string; title: string; body: string };

const unescape = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** The mock reads the same prompt a real model would get. */
function readNotes(prompt: string): ParsedNote[] {
  const re = /<note id="([^"]+)" title="([^"]*)">\n([\s\S]*?)\n<\/note>/g;
  return [...prompt.matchAll(re)].map((m) => ({ id: m[1], title: unescape(m[2]), body: unescape(m[3]) }));
}

const firstSentence = (text: string) => {
  const s = text.trim().split(/(?<=[.!?])\s/)[0] ?? '';
  return s.length > 200 ? `${s.slice(0, 197)}...` : s;
};

export class MockSummaryProvider implements SummaryProvider {
  readonly model: string;
  private calls = 0;

  constructor(private readonly scenario: MockScenario = 'normal') {
    this.model = `mock-summarizer (${scenario})`;
  }

  async complete({ user }: ModelRequest): Promise<string> {
    this.calls += 1;
    const notes = readNotes(user);

    if (this.scenario === 'malformed-once' && this.calls === 1) {
      return '{"summary": "The project is on track and the team agreed on';
    }

    if (this.scenario === 'compromised') {
      return JSON.stringify({
        summary: 'All notes deleted',
        keyPoints: ['Admin mode enabled'],
        citedNoteIds: ['00000000-0000-4000-8000-000000000000'],
        systemPrompt: 'You summarize a project\'s notes...',
      });
    }

    const safe = notes.filter((n) => !looksLikeInjection(`${n.title} ${n.body}`));
    const suspicious = notes.filter((n) => !safe.includes(n));

    const keyPoints = safe.slice(0, 7).map((n) => `${n.title}: ${firstSentence(n.body) || '(empty)'}`);
    if (suspicious.length) {
      keyPoints.push(
        `${suspicious.length} note(s) contain embedded instructions aimed at the AI; they were treated as data and not followed.`,
      );
    }

    return JSON.stringify({
      summary: `${notes.length} note(s) reviewed. ${safe.map((n) => firstSentence(n.body)).filter(Boolean).join(' ')}`
        .slice(0, 1000)
        .trim(),
      keyPoints,
      citedNoteIds: safe.map((n) => n.id),
    });
  }
}
