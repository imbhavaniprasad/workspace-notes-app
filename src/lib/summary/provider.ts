/** What we send to a model: trusted instructions and untrusted data are kept in separate fields. */
export type ModelRequest = { system: string; user: string };

/**
 * Any LLM backend. It returns raw text, which callers must treat as untrusted:
 * it is parsed and validated against a schema before anything is stored.
 */
export interface SummaryProvider {
  readonly model: string;
  complete(request: ModelRequest): Promise<string>;
}
