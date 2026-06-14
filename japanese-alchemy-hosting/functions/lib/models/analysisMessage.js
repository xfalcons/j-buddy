"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAnalysisMessage = exports.MAX_CONTEXT_CHARS = exports.CONTEXT_AFTER_LABEL = exports.TARGET_LABEL = exports.CONTEXT_BEFORE_LABEL = void 0;
// Delimiter labels. These MUST stay in sync with the V1/V2 system-prompt
// instruction (src/models/systemPromptV1.ts, systemPromptV2.ts).
exports.CONTEXT_BEFORE_LABEL = "【前文】";
exports.TARGET_LABEL = "【分析対象】";
exports.CONTEXT_AFTER_LABEL = "【後文】";
// Server-side safety bound per context side. Clients clamp to ~100 chars
// (extension src/scripts/surroundingContext.js), but explainStream is an
// unauthenticated onRequest handler, so the server enforces its own ceiling.
exports.MAX_CONTEXT_CHARS = 500;
// Matches a delimiter keyword wrapped in full-width (【】), half-width (［］), or
// ASCII ([]) brackets, with optional internal whitespace. Exact-token stripping
// alone was bypassable with visually-identical bracket variants (［分析対象］,
// 【 分析対象 】) on the unauthenticated endpoint, so all lookalikes are stripped.
const DELIMITER_PATTERN = /[\[【［]\s*(?:前文|分析対象|後文)\s*[\]】］]/g;
/** Remove delimiter markers (and lookalike variants) from untrusted text. */
function stripDelimiterTokens(text) {
    return text.replace(DELIMITER_PATTERN, "");
}
function clamp(text, max) {
    return text.length > max ? text.slice(0, max) : text;
}
/**
 * @param content the selected text — the sole analysis target (trusted, verbatim)
 * @param context optional surrounding page text (untrusted, sanitized + clamped)
 */
function buildAnalysisMessage(content, context) {
    const beforeRaw = typeof context?.before === "string" ? context.before : "";
    const afterRaw = typeof context?.after === "string" ? context.after : "";
    const before = clamp(stripDelimiterTokens(beforeRaw).trim(), exports.MAX_CONTEXT_CHARS);
    const after = clamp(stripDelimiterTokens(afterRaw).trim(), exports.MAX_CONTEXT_CHARS);
    if (!before && !after) {
        return content;
    }
    const parts = [];
    if (before)
        parts.push(`${exports.CONTEXT_BEFORE_LABEL}${before}`);
    parts.push(`${exports.TARGET_LABEL}${content}`);
    if (after)
        parts.push(`${exports.CONTEXT_AFTER_LABEL}${after}`);
    return parts.join("\n");
}
exports.buildAnalysisMessage = buildAnalysisMessage;
//# sourceMappingURL=analysisMessage.js.map