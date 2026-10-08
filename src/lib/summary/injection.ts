/**
 * Heuristic flag for notes that look like prompt-injection attempts. This is
 * NOT the defense (keyword filters are easy to bypass). The defense is
 * structural: notes are escaped and passed as data, the model has no tools, and
 * its output must match a strict schema. The flag just tells the user to look.
 */
const PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(the\s+)?(previous|prior|above|system)/i,
  /system\s+prompt/i,
  /you\s+are\s+now\s+/i,
];

export function looksLikeInjection(text: string): boolean {
  return PATTERNS.some((p) => p.test(text));
}
