import { MAX_CONTEXT_CHARS } from "../models/analysisMessage";

export const MIN_CONTENT_LENGTH = 2;
export const MAX_CONTENT_LENGTH = 500;
// Envelope ceiling for the streaming endpoint. The platform-level body cap and
// field-level validation are the backstops for under-reported/chunked bodies.
export const MAX_REQUEST_BYTES = 16 * 1024;

export interface ValidationResult {
  ok: boolean;
  error?: string;
  status: number;
}

/**
 * Validate the explain request body. Shared by explainStream and explain so the
 * analysis-text contract cannot drift between surfaces. Server-authoritative:
 * never trusts the client's 2-500 contract.
 *
 * @returns `{ ok, error, status }` — `status` is the HTTP code (stream) and
 * maps to an `invalid-argument` error on the callable.
 */
export function validateExplainRequest(body: unknown): ValidationResult {
  const content = (body as any)?.content;
  if (
    typeof content !== "string" ||
    content.length < MIN_CONTENT_LENGTH ||
    content.length > MAX_CONTENT_LENGTH
  ) {
    return {
      ok: false,
      status: 400,
      error: `content must be a string of ${MIN_CONTENT_LENGTH}-${MAX_CONTENT_LENGTH} characters`,
    };
  }

  const before = (body as any)?.context_before;
  if (before !== undefined) {
    if (typeof before !== "string" || before.length > MAX_CONTEXT_CHARS) {
      return {
        ok: false,
        status: 400,
        error: `context_before must be a string of at most ${MAX_CONTEXT_CHARS} characters`,
      };
    }
  }

  const after = (body as any)?.context_after;
  if (after !== undefined) {
    if (typeof after !== "string" || after.length > MAX_CONTEXT_CHARS) {
      return {
        ok: false,
        status: 400,
        error: `context_after must be a string of at most ${MAX_CONTEXT_CHARS} characters`,
      };
    }
  }

  const prompt = (body as any)?.prompt;
  if (prompt !== undefined && prompt !== "v1" && prompt !== "v2") {
    return { ok: false, status: 400, error: "Prompt must be 'v1' or 'v2'" };
  }

  return { ok: true, status: 200 };
}

/**
 * Body-size guard for the streaming endpoint. Rejects oversized requests before
 * any parsing work or LLM invocation, based on the Content-Length header.
 */
export function isBodyTooLarge(req: {
  header: (name: string) => string | undefined;
}): boolean {
  const cl = Number(req.header("content-length") ?? 0);
  return Number.isFinite(cl) && cl > MAX_REQUEST_BYTES;
}
