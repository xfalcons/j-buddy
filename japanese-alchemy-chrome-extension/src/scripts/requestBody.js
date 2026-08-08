/**
 * Pure builder for the explain request body, shared by the streaming and callable
 * API methods in jaAlchemyApiService. Extracted into its own module so the
 * body-construction logic is unit-testable without importing the firebase-backed
 * service module.
 *
 * context_before / context_after are included only when non-empty, so the
 * no-context request body is identical to today's shape (backward compatible).
 *
 * @param {string} content - the selected text (analysis target)
 * @param {string} promptVersion - "v1" | "v2"
 * @param {{ before?: string, after?: string }} [context]
 * @returns {{ content: string, prompt: string, context_before?: string, context_after?: string }}
 */
export function buildRequestBody(content, promptVersion, context, ai) {
  const body = { content, prompt: promptVersion || 'v2' };
  if (ai) body.ai = ai;
  const before = context && context.before;
  const after = context && context.after;
  if (before) body.context_before = before;
  if (after) body.context_after = after;
  return body;
}
