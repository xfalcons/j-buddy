/**
 * Surrounding-context capture for the Chrome extension content script.
 *
 * The content script sends only window.getSelection().toString() today — the bare
 * selection with none of the text around it. Japanese is highly context-dependent,
 * so a small window of adjacent page text dramatically helps the LLM disambiguate
 * homograph readings, grammar patterns, and word sense. Context is disambiguation
 * input only; the selected text remains the sole analysis target (see the backend
 * prompt instruction).
 *
 * extractSurroundingContext() bounds each side of the window to its own nearest
 * block ancestor so context never bleeds across unrelated page regions (e.g. a
 * different paragraph or table cell), collapses inter-element whitespace, and
 * clamps each side to maxChars. Failure to extract yields empty strings rather
 * than throwing.
 */

// Block-level element tags. When the selection's common ancestor is inside one of
// these, that element is the context boundary. We walk up past inline elements
// (span, a, em, strong, …) so a selection inside a styled run still scopes to its
// paragraph rather than the whole document.
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'CAPTION', 'DD', 'DETAILS',
  'DIALOG', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER',
  'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HGROUP', 'LI', 'MAIN',
  'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD',
  'TR', 'UL',
]);

function isInlineElement(el) {
  return (
    !!el &&
    el.nodeType === Node.ELEMENT_NODE &&
    !BLOCK_TAGS.has(el.tagName)
  );
}

function nearestBlockAncestor(node) {
  let el =
    node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && isInlineElement(el)) el = el.parentElement;
  return el;
}

/** Collapse runs of whitespace (newlines, tabs, etc.) to single spaces and trim. */
export function collapseWhitespace(text) {
  return String(text == null ? '' : text)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract up to maxChars of page text before and after the selection, bounding
 * each side to its own nearest block ancestor.
 * @param {Selection | null | undefined} selection
 * @param {{ maxChars?: number }} [opts]
 * @returns {{ before: string, after: string }} empty strings on any failure
 */
export function extractSurroundingContext(selection, opts) {
  const maxChars =
    opts && Number.isFinite(opts.maxChars) ? opts.maxChars : 100;
  const empty = { before: '', after: '' };

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return empty;
  }

  const range = selection.getRangeAt(0);
  // Bound each side to its own nearest block so context never bleeds across a
  // sibling block (e.g. an adjacent paragraph) for multi-block selections.
  const startBlock = nearestBlockAncestor(range.startContainer);
  const endBlock = nearestBlockAncestor(range.endContainer);
  if (!startBlock || !endBlock) return empty;

  let beforeRaw = '';
  let afterRaw = '';
  try {
    // Text from the start of the start block up to the selection start.
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(startBlock);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    beforeRaw = beforeRange.toString();

    // Text from the selection end to the end of the end block.
    const afterRange = document.createRange();
    afterRange.selectNodeContents(endBlock);
    afterRange.setStart(range.endContainer, range.endOffset);
    afterRaw = afterRange.toString();
  } catch (err) {
    return empty;
  }

  const beforeAll = collapseWhitespace(beforeRaw);
  const afterAll = collapseWhitespace(afterRaw);

  return {
    before: beforeAll.slice(Math.max(0, beforeAll.length - maxChars)),
    after: afterAll.slice(0, maxChars),
  };
}

/**
 * Cache-key version segment. Bumped whenever the shape of a cached
 * 'lastResponse' changes - notably when the client-side conjugation engine
 * began enriching the stored markdown. An old key written under a prior
 * version no longer matches, so an upgraded client never serves a pre-engine
 * cached response.
 */
const CACHE_VERSION = 'cgv1';

/**
 * Build a stable cache key for an analysis so the result cache invalidates when
 * either the selected text OR its surrounding context changes.
 *
 * Both branches carry the cache-version prefix (see CACHE_VERSION) so a key
 * written before the conjugation engine shipped cannot match. With empty or
 * absent context the key reduces to the version + the bare selected text. The
 * context-path key carries a NUL sentinel and SOH field separators (after the
 * version prefix) so it stays disjoint from any bare selectedText: a real page
 * selection contains no control bytes, so a no-context selection whose text
 * happens to resemble a serialized context key cannot collide and serve a
 * stale analysis. Length prefixes keep before/after unambiguous.
 * @param {{ selectedText?: string, promptVariant?: string, context?: { before?: string, after?: string } }} entry
 * @returns {string}
 */
export function buildContextCacheKey({ selectedText, context, promptVariant } = {}) {
  const text = selectedText || '';
  const before = (context && context.before) || '';
  const after = (context && context.after) || '';
  // NUL sentinel + SOH separators - control bytes a real page selection cannot
  // contain, keeping the context key disjoint from the bare no-context form.
  const NUL = String.fromCharCode(0);
  const SOH = String.fromCharCode(1);
  const variant = promptVariant || '';
  const cachePrefix = variant
    ? CACHE_VERSION + 'p' + variant.length + '|' + variant + SOH
    : CACHE_VERSION;
  if (!before && !after) return cachePrefix + text;
  return (
    cachePrefix +
    NUL + text.length + '|' + text +
    SOH + before.length + '|' + before +
    SOH + after.length + '|' + after
  );
}
