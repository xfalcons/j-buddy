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

### Cached analysis result
The most recent completed analysis result retained locally by the Chrome side panel, including the rendered output and the structured state needed to restore its existing result actions for the same analysis context.

### Prompt variant
A selectable prompt contract for analysis generation. Variants may ask for different explanation depth, but they should preserve the fields downstream parsers and enrichment passes depend on.

### Analysis mode
A learner-facing label for a prompt variant in the Chrome extension sidebar. Analysis modes describe the learning purpose, such as quick comprehension or sentence production, instead of exposing raw prompt version names.

### Managed provider
The J-Buddy-operated analysis route, selected when a learner uses the service's shared provider configuration rather than their own provider profile.

### Personal provider
A learner's own configured LLM provider profile, selected to analyze text directly from the extension instead of using the managed provider.

### Model catalog
The list of models a personal provider authorizes for a learner's configured API URL and API key, obtained through its OpenAI-compatible authenticated `/models` endpoint. J-Buddy retains the last successful catalog for the currently saved personal provider generation and restores it without a network request while its protocol, normalized full API URL, and credential identity remain unchanged. The learner chooses one returned model from a required dropdown. An unavailable, empty, or incompatible catalog prevents Chat Completions-compatible profile saving; for a Responses-compatible provider, a failed catalog attempt unlocks a connection-bound manual model ID fallback. Changing the protocol, API URL, or API key makes a catalog from the prior connection inapplicable.

### Staged provider profile
Unpersisted protocol, API URL, API key, and model selection held in the personal-provider form. The selection is normally catalog-backed; after Responses-compatible catalog discovery fails, it may instead be a non-empty manual model ID bound to the same staged connection. It cannot replace the saved personal provider profile until the learner explicitly saves all values together. Model discovery first requests access only to the staged provider origin; a newly granted but unsaved permission is released if discovery fails or the staged connection changes. Saving a manual fallback requests that exact origin permission again from the explicit save gesture.

### Masked API key
The `****************` value shown for a saved personal-provider credential. It is a non-secret UI placeholder: leaving it untouched preserves the saved credential, while editing it supplies a replacement credential. It may be reused only for a configured API URL on the same provider origin; switching origins requires a replacement key. A failed update retains the saved credential and its masked state.

### High-value vocabulary item
A vocabulary item selected for analysis because it materially helps comprehension or later sentence production in the current source text. High-value items may include verbs, サ變 nouns, adjectives, adverbs, compound nouns, and katakana loanwords, and are preferred over exhaustive N1-N3 extraction.
