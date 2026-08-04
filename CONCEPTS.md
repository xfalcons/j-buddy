# Concepts

Shared domain vocabulary for this project - entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as aidd-compound and aidd-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Analysis Flow

### Analysis markdown
The markdown document produced for a selected Japanese text analysis, carrying the original sentence, vocabulary entries, grammar entries, and ruby annotations in the project's `{kanji|reading}` format.

### Ruby tag format
The project's portable annotation syntax for Japanese readings: `{kanji|reading}` in markdown, converted to HTML ruby for display while remaining stable in saved or exported text.

### Saved item
A vocabulary or grammar entry selected from an analysis and persisted for later review with enough detail to render outside the original sidepanel session.

### Enriched markdown
Analysis markdown after a deterministic client-side preprocessing pass has added computed fields while preserving the same markdown contract for rendering, saving, copying, exporting, and caching.

### Prompt variant
A selectable prompt contract for analysis generation. Variants may ask for different explanation depth, but they should preserve the fields downstream parsers and enrichment passes depend on.
