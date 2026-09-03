# Concepts

Shared domain vocabulary for this project - entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as aidd-compound and aidd-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Analysis Flow

### Analysis markdown
The markdown document produced for a selected Japanese text analysis, carrying the original sentence, vocabulary entries, grammar entries, and ruby annotations in the project's `{kanji|reading}` format.

### Ruby tag format
The project's portable annotation syntax for Japanese readings: `{kanji|reading}` in markdown, converted to HTML ruby for display while remaining stable in saved or exported text.

### Saved item
A vocabulary or grammar entry derived from a saved analysis page and persisted for later review with enough detail to render outside the original sidepanel session. Each derived item is a snapshot of the page's content at save time, not a live reference to the page.

### Enriched markdown
Analysis markdown after a deterministic client-side preprocessing pass has added computed fields while preserving the same markdown contract for rendering, saving, copying, exporting, and caching.

### Cached analysis result
The most recent completed analysis result retained locally by the Chrome side panel, including the rendered output and the structured state needed to restore its existing result actions for the same analysis context.

### Prompt variant
A selectable prompt contract for analysis generation. Variants may ask for different explanation depth, but they should preserve the fields downstream parsers and enrichment passes depend on.

### Analysis mode
A learner-facing label for a prompt variant in the Chrome extension sidebar. Analysis modes describe the learning purpose, such as quick comprehension or sentence production, instead of exposing raw prompt version names.

### Managed provider
The J-Buddy-operated analysis route, selected when a learner uses the service's shared provider configuration rather than their own provider profile.


### High-value vocabulary item
A vocabulary item selected for analysis because it materially helps comprehension or later sentence production in the current source text. High-value items may include verbs, サ變 nouns, adjectives, adverbs, compound nouns, and katakana loanwords, and are preferred over exhaustive N1-N3 extraction.

### Analysis page
A completed sidepanel analysis saved as one unit — the full rendered analysis markdown (vocabulary and grammar sections with ruby annotations) plus source metadata (original source text, source URL, timestamp) — persisted to a personal pages collection for later browsing in the webapp. Saving a page also derives all vocabulary and grammar items into the existing per-item review collections as snapshots.
