// Capture surrounding sentence context for disambiguation
import { extractSurroundingContext } from './surroundingContext.js';

// Default context window per side. Kept as a named constant so it can be tuned
// without touching the extraction logic.
const CONTEXT_MAX_CHARS = 100;

// Listen for text selection
document.addEventListener("mouseup", () => {
  if (chrome.runtime?.id) {
    const selection = window.getSelection();
    const selectedText = selection?.toString()?.trim();
    if (selectedText) {
      const { before, after } = extractSurroundingContext(selection, {
        maxChars: CONTEXT_MAX_CHARS,
      });
      chrome.runtime.sendMessage({
        action: "textSelected",
        data: selectedText,
        contextBefore: before,
        contextAfter: after,
      });
    }
  }
});
