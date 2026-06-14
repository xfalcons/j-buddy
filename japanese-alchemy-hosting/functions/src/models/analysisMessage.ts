/**
 * Builds the user message passed to the LLM for the explain endpoints.
 *
 * When surrounding context is present, the message wraps the analysis target in
 * a clearly-marked block with optional before/after context blocks (for
 * disambiguation only). When context is absent — or empty after clamping — the
 * message is the raw content unchanged, byte-identical to the pre-context
 * behavior. That keeps backward compatibility, the golden-dataset harness (which
 * sends raw input), and the V1/V2 A/B baseline all intact.
 *
 * The context sides originate from arbitrary page content and are untrusted, so
 * they are (1) sanitized of the structural delimiter tokens so page text cannot
 * spoof the message structure and re-target the analysis, and (2) clamped to a
 * server-side ceiling so a malformed client cannot inflate the prompt.
 */

// Delimiter labels. These MUST stay in sync with the V1/V2 system-prompt
// instruction (src/models/systemPromptV1.ts, systemPromptV2.ts).
export const CONTEXT_BEFORE_LABEL = "【前文】";
export const TARGET_LABEL = "【分析対象】";
export const CONTEXT_AFTER_LABEL = "【後文】";

// Server-side safety bound per context side. Clients clamp to ~100 chars
// (extension src/scripts/surroundingContext.js), but explainStream is an
// unauthenticated onRequest handler, so the server enforces its own ceiling.
export const MAX_CONTEXT_CHARS = 500;

const DELIMITER_TOKENS = [
  CONTEXT_BEFORE_LABEL,
  TARGET_LABEL,
  CONTEXT_AFTER_LABEL,
];

export interface SurroundingContext {
  before?: string;
  after?: string;
}

/** Remove literal delimiter tokens from untrusted text (prompt-injection hardening). */
function stripDelimiterTokens(text: string): string {
  let out = text;
  for (const token of DELIMITER_TOKENS) {
    if (out.includes(token)) {
      out = out.split(token).join("");
    }
  }
  return out;
}

function clamp(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * @param content the selected text — the sole analysis target (trusted, verbatim)
 * @param context optional surrounding page text (untrusted, sanitized + clamped)
 */
export function buildAnalysisMessage(
  content: string,
  context?: SurroundingContext | null
): string {
  const beforeRaw = typeof context?.before === "string" ? context.before : "";
  const afterRaw = typeof context?.after === "string" ? context.after : "";

  const before = clamp(stripDelimiterTokens(beforeRaw).trim(), MAX_CONTEXT_CHARS);
  const after = clamp(stripDelimiterTokens(afterRaw).trim(), MAX_CONTEXT_CHARS);

  if (!before && !after) {
    return content;
  }

  const parts: string[] = [];
  if (before) parts.push(`${CONTEXT_BEFORE_LABEL}${before}`);
  parts.push(`${TARGET_LABEL}${content}`);
  if (after) parts.push(`${CONTEXT_AFTER_LABEL}${after}`);
  return parts.join("\n");
}
