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
 * extractSurroundingContext() bounds the window to the selection's nearest block
 * ancestor so context never bleeds across unrelated page regions (e.g. a different
 * paragraph or table cell), collapses inter-element whitespace, and clamps each
 * side to maxChars. Failure to extract yields empty strings rather than throwing.
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
 * Extract up to maxChars of page text before and after the selection, bounded to
 * the selection's nearest block ancestor.
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
  const block = nearestBlockAncestor(range.commonAncestorContainer);
  if (!block) return empty;

  let beforeRaw = '';
  let afterRaw = '';
  try {
    // Text from the start of the block up to the selection start.
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(block);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    beforeRaw = beforeRange.toString();

    // Text from the selection end to the end of the block.
    const afterRange = document.createRange();
    afterRange.selectNodeContents(block);
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
