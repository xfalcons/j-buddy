---
title: "feat: Prompt Evaluation Harness & V1/V2 Grammar Redesign"
type: feat
status: active
date: 2026-06-09
origin: docs/brainstorms/2026-06-09-prompt-evaluation-harness-requirements.md
---

# feat: Prompt Evaluation Harness & V1/V2 Grammar Redesign

## Summary

Redesign V1 and V2 grammar analysis prompts to be genuinely different (concise vs. comprehensive), fix known bugs, wire a feature toggle for A/B testing, and build a two-tier Jest evaluation harness to measure which version drives higher save rate.

## Problem Frame

V1 and V2 prompts are identical. The grammar section has a heading mismatch (`〜かいがある` vs `〜として`), invented examples disconnected from the source text, a hardcoded cap of 2 grammar points, and textbook-only Japanese. There is no test infrastructure for prompt quality, so every prompt change is a blind deployment.

---

## Requirements

*Origin: `docs/brainstorms/2026-06-09-prompt-evaluation-harness-requirements.md`*

**V1 Prompt — Concise Grammar**

R1. V1 identifies 1-3 JLPT grammar points (replacing fixed cap of 2).
R2. Per grammar point: pattern name + JLPT level, formation rule, usage grounded in user's sentence first, 1-2 additional natural examples with `{kanji|reading}` ruby.
R3. Grammar heading matches its content in the prompt example.
R4. Additional examples use natural modern Japanese, labeled by register when usage differs between casual and formal.
R5. Vocabulary section unchanged — isolates grammar for A/B test.

**V2 Prompt — Comprehensive Grammar**

R6. V2 includes everything in V1 (R1-R5).
R7. V2 identifies 1-5 JLPT grammar points.
R8. V2 adds native speaker intuition field (tone, register, what it "feels like").
R9. V2 adds similar pattern comparison when pedagogically useful.
R10. V2 adds register-labeled examples (カジュアル/丁寧/ビジネス).
R11. V2 adds literal decomposition field.

**Feature Toggle**

R12. `prompt` field in `ExplainRequest` selects `"v1"` or `"v2"`.
R13. Chrome extension sends `"v2"` by default; A/B test overrides per-user via `chrome.storage.local`.
R14. Backend logs prompt version alongside request.
R15. Both versions share the same output section structure.

**Golden Dataset**

R16. Golden dataset of Japanese sentences as JSON fixtures with expected binary checks.
R17. Dataset covers: kanji ambiguity, passive/causative, katakana, keigo, conditionals, long sentences, short selections.
R18. Each example checks: ruby format, vocabulary terms, grammar points, section structure, parseability.
R19. Starts with 10+ examples.

**Evaluation Harness — Tier 1**

R20. Mocked LLM responses, no real API calls.
R21. Validates structure for both V1 and V2: headings, ruby syntax, grammar heading matches content.
R22. Runs as part of `npm test`.
R23. Failure messages identify which check and which example.

**Evaluation Harness — Tier 2**

R24. Real LLM calls scored against golden dataset.
R25. Separate script (`npm run test:prompt-quality`).
R26. Accepts `--provider` and `--prompt-version` flags.
R27. Per-example pass/fail summary plus overall score; comparison report when run against both versions.
R28. Tolerant of non-determinism via partial matches.

---

## Key Technical Decisions

**KTD1. Both handlers default to `"v2"`.** The callable handler currently defaults to `"v1"` while the stream handler defaults to `"v2"`. Aligning both to `"v2"` matches Chrome extension behavior and avoids the inconsistency. The callable is preserved for backward compatibility but the Chrome extension uses streaming exclusively.

**KTD2. Feature toggle via `chrome.storage.local`, not Firebase Remote Config.** No existing A/B infrastructure. Using `chrome.storage.local` for variant assignment is the simplest path — the extension reads a stored preference and sends it in the request body. This avoids adding Remote Config dependency. Trade-off: no server-side assignment or cross-device consistency. Acceptable for initial A/B test scope.

**KTD3. Prompt language stays Traditional Chinese + Japanese grammar terms.** Research shows language-matched prompts improve accuracy by double digits over English for Japanese text analysis (FacetScore 2025). The current approach is near-optimal.

**KTD4. Few-shot example corrected, not removed.** The current embedded example has bugs (heading mismatch, generic conjugation templates). Both V1 and V2 get corrected examples that demonstrate proper heading-content alignment and context-grounded grammar explanation. The example stays inline in the system prompt for consistency with the existing pattern — moving to assistant-role messages is a separate optimization deferred to later.

**KTD5. Tier 2 uses `createLlmService()` directly, not HTTP endpoints.** The evaluation harness calls the LLM service layer directly rather than going through the HTTP handlers. This avoids needing to spin up Firebase emulators for quality tests. The harness imports `createLlmService()` and calls `chatCompletion()` with the prompt under test.

**KTD6. Golden examples are JSON fixtures in `functions/test/prompts/fixtures/`.** Each fixture contains: input sentence, expected grammar points, expected vocabulary terms, and structural checks. Jest discovers them via glob. Adding a new example requires only a new JSON file — no test code changes.

---

## Implementation Units

### U1. Redesign V1 System Prompt (Concise Grammar)

**Goal:** Create a genuinely different V1 prompt with concise grammar analysis, fixing all known bugs.

**Requirements:** R1-R5

**Dependencies:** None

**Files:**
- `japanese-alchemy-hosting/functions/src/models/systemPromptV1.ts` (modify)

**Approach:** Rewrite the grammar section (script rule 5) in `systemPromptV1.ts`. Keep the role, action, and vocabulary rules (rules 1-4) identical to current. Changes to rule 5: replace "只能列出二則分析" with dynamic 1-3 cap instruction; add "first explain how this grammar pattern functions in the user's input sentence" instruction; fix the example to use correct heading-content alignment; add register labels to examples. Fix the hardcoded example sentence to demonstrate proper grounding (explain grammar from the example text itself, not invented sentences). Keep the output structure (`### 原句`, `### 單字分析`, `### 文法分析`) identical.

**Patterns to follow:** Existing prompt structure in `systemPromptV2.ts` for role/action/script format. The vocabulary section (rules 1-4) stays verbatim.

**Test scenarios:**
- Unit test: prompt string is non-empty and contains "文法分析"
- Unit test: prompt does not contain "只能列出二則分析"
- Unit test: prompt grammar example heading matches its content (no `〜かいがある` / `〜として` mismatch)
- Golden example: V1 prompt with a sentence containing 3+ JLPT grammar patterns produces at least 2 grammar points (dynamic cap working)
- Golden example: V1 output grammar section references the user's actual input sentence before providing additional examples

**Verification:** Tier 1 structural tests pass with V1 fixture. Manual Tier 2 run shows grammar points grounded in input sentence.

---

### U2. Redesign V2 System Prompt (Comprehensive Grammar)

**Goal:** Create V2 prompt with comprehensive grammar analysis including native intuition, similar patterns, and register-labeled examples.

**Requirements:** R6-R11

**Dependencies:** U1 (V1 establishes the base; V2 builds on it)

**Files:**
- `japanese-alchemy-hosting/functions/src/models/systemPromptV2.ts` (modify)

**Approach:** Start from V1's corrected grammar section, then add: (1) widen cap to 1-5 grammar points; (2) add instruction for native speaker intuition (母語者語感) field per grammar point; (3) add instruction for similar pattern comparison when pedagogically useful — one commonly confused pattern with key difference and contrastive example; (4) add instruction for register-labeled examples (カジュアル/丁寧/ビジネス); (5) add instruction for literal decomposition (元素分解) — break grammar pattern into component parts and reconstruct literal meaning. The corrected example must demonstrate all new fields.

**Patterns to follow:** Same role/action/script structure as V1. Grammar section is the only difference between V1 and V2.

**Test scenarios:**
- Unit test: prompt string is non-empty and contains "文法分析"
- Unit test: prompt contains "母語者語感" or equivalent native intuition instruction
- Unit test: prompt contains similar pattern comparison instruction
- Unit test: prompt contains register labels (カジュアル/丁寧/ビジネス)
- Golden example: V2 with a complex sentence produces 3-5 grammar points
- Golden example: V2 grammar sections include native intuition field
- Golden example: V2 output is parseable by `formatAnalysisResult` without errors (shared structure)

**Verification:** Tier 2 run against V2 produces richer output than V1 while maintaining same section structure.

---

### U3. Align Handler Defaults and Add Structured Logging

**Goal:** Unify both handlers to default to `"v2"`, add prompt version to structured log output for A/B analysis.

**Requirements:** R14

**Dependencies:** U1, U2

**Files:**
- `japanese-alchemy-hosting/functions/src/v1/explainCallable.ts` (modify — change default from `"v1"` to `"v2"`)
- `japanese-alchemy-hosting/functions/src/v1/explainStreamHandler.ts` (verify — already defaults to `"v2"`)

**Approach:** In `explainCallable.ts` line 12, change `prompt = "v1"` to `prompt = "v2"`. Both handlers already log prompt version via `logger.info`. Verify the logger includes user ID context (it does via the existing `setContext` pattern). No additional logging infrastructure needed — the existing Firebase Functions logger captures prompt version + user ID + timestamp.

**Patterns to follow:** Existing logger usage in both handlers.

**Test scenarios:**
- Unit test: calling explainCallable with no `prompt` field uses `"v2"` as default
- Unit test: calling explainStreamHandler with no `prompt` field uses `"v2"` as default
- Unit test: both handlers accept `"v1"` and `"v2"` and reject other values with 400/error

**Verification:** Both handlers log `prompt version: v2` when no prompt field is provided.

---

### U4. Chrome Extension Feature Toggle

**Goal:** Add A/B test variant assignment in the Chrome extension, stored in `chrome.storage.local`, passed to the API call.

**Requirements:** R12, R13

**Dependencies:** U3

**Files:**
- `japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js` (modify — read variant from storage, pass to API call)
- `japanese-alchemy-chrome-extension/src/background/background.js` (modify — add storage helper if needed)

**Approach:** On first launch, assign variant: read `promptVariant` from `chrome.storage.local`. If not set, assign `"v2"` (default) and store it. When calling `generateResponseStream`, pass the stored variant instead of hardcoded `'v2'`. For initial rollout, all users get `"v2"`. To start A/B test, manually set some users to `"v1"` via a debug toggle or random assignment. The API call in `jaAlchemyApiService.generateResponseStream()` already accepts `promptVersion` as a parameter — just wire the stored value through.

**Patterns to follow:** Existing `chrome.storage.local` usage in the extension for `selectedText`.

**Test scenarios:**
- Unit test: when `promptVariant` is not set in storage, defaults to `"v2"`
- Unit test: when `promptVariant` is `"v1"` in storage, API call sends `prompt: "v1"`
- Unit test: stored variant persists across sidepanel reopenings

**Verification:** Set `chrome.storage.local` to `"v1"`, trigger analysis, verify server log shows `prompt version: v1`.

---

### U5. Golden Dataset Curation

**Goal:** Create the initial golden dataset of 10+ Japanese sentences covering key difficulty axes.

**Requirements:** R16-R19

**Dependencies:** None (parallel with U1/U2)

**Files:**
- `japanese-alchemy-hosting/functions/test/prompts/fixtures/` (new directory)
- `japanese-alchemy-hosting/functions/test/prompts/fixtures/*.json` (new files, one per example)

**Approach:** Create JSON fixtures, each containing: `id` (slug), `input` (Japanese sentence), `difficulty` (axis label), `expectedVocabulary` (array of kanji terms that must appear), `expectedGrammar` (array of JLPT pattern names that must be identified), `expectedSections` (which section headings must be present), `structuralChecks` (ruby format valid, heading matches content). Cover these 10 examples: (1) homograph disambiguation (生/上), (2) passive form, (3) causative form, (4) causative-passive, (5) katakana loanwords, (6) keigo (honorific), (7) conditionals (と/ば/たら/なら), (8) near-500-char sentence, (9) short selection (3 chars), (10) mixed N1/N2/N3 grammar. Also produce 2 pre-recorded V1 and V2 response fixtures for Tier 1 mocked tests.

**Patterns to follow:** Existing test fixture pattern in `functions/test/services/geminiService.test.ts` for mock response objects.

**Test scenarios:**
- Unit test: all fixture files are valid JSON with required fields (`id`, `input`, `expectedGrammar`)
- Unit test: fixture count is at least 10
- Unit test: no two fixtures share the same `id`

**Verification:** `require()` each fixture file without errors; all have `expectedGrammar` arrays with at least one entry.

---

### U6. Tier 1 Structural Validation Tests

**Goal:** Build the CI-gate test suite that validates prompt output structure against golden fixtures using mocked LLM responses.

**Requirements:** R20-R23

**Dependencies:** U1, U2, U5

**Files:**
- `japanese-alchemy-hosting/functions/test/prompts/promptEvaluation.test.ts` (new)
- `japanese-alchemy-hosting/functions/test/prompts/fixtures/v1-response.md` (new — pre-recorded V1 output)
- `japanese-alchemy-hosting/functions/test/prompts/fixtures/v2-response.md` (new — pre-recorded V2 output)

**Approach:** Create a Jest test file that: (1) loads each golden example fixture; (2) loads the pre-recorded response for the prompt version under test; (3) runs structural checks: section headings present (`### 原句`, `### 單字分析`, `### 文法分析`), `{kanji|reading}` ruby format well-formed (regex match), grammar headings present and non-empty, `formatAnalysisResult` equivalent parser produces valid `words[]` and `grammars[]` arrays, grammar heading matches its content (no mismatch). The test uses mocked responses, not real LLM calls. Runs as part of `npm test`.

**Patterns to follow:** Existing test patterns in `functions/test/services/geminiService.test.ts` — mock setup, AAA pattern, descriptive test names. Jest `describe.each` for iterating over fixtures.

**Test scenarios:**
- Structural: all three section headings present in output
- Structural: `{kanji|reading}` format well-formed (matched by `/{[^}]+\|[^}]+}/g`)
- Structural: grammar headings match content (no `〜かいがある` / `〜として` mismatch)
- Structural: output parseable by client parser — words and grammars arrays non-empty
- Per-fixture: expected vocabulary terms appear in output (at least N of M expected terms)
- Per-fixture: expected grammar points appear in output (at least 1 of expected patterns)
- Error reporting: failure message includes fixture ID and which check failed

**Verification:** `npm test` in `functions/` runs Tier 1 tests alongside existing tests. All pass with corrected prompt fixtures.

---

### U7. Tier 2 Quality Validation Runner

**Goal:** Build the manual/nightly test runner that calls the real LLM and scores output against golden fixtures.

**Requirements:** R24-R28

**Dependencies:** U5, U6

**Files:**
- `japanese-alchemy-hosting/functions/test/prompts/promptQuality.test.ts` (new)
- `japanese-alchemy-hosting/functions/package.json` (modify — add `test:prompt-quality` script)

**Approach:** Create a separate test file excluded from the default Jest run (via testPathIgnorePatterns or a dedicated config). The runner: (1) accepts `--provider` flag via environment variable (default: current config); (2) accepts `--prompt-version` flag to test V1 or V2; (3) calls `createLlmService()` directly, then `chatCompletion(systemPrompt, input)` for each golden example; (4) scores the real output against each example's binary checks using partial matching (e.g., "at least 2 of 3 expected grammar points found"); (5) outputs a summary table: per-example pass/fail per check, overall score. When run against both versions, produces a comparison table.

**Patterns to follow:** Same Jest patterns. Import `createLlmService` from src. Use `describe.skipIf` or environment variable guard to exclude from default run.

**Test scenarios:**
- Runner skips when `PROMPT_QUALITY_TEST` env var is not set (excluded from CI)
- Runner loads V1 prompt when `--prompt-version=v1` is set
- Runner loads V2 prompt when `--prompt-version=v2` is set
- Per-example: vocabulary check passes when at least N of M expected terms appear
- Per-example: grammar check passes when at least 1 expected pattern is identified
- Per-example: structural check passes when all section headings present
- Summary output shows overall score (e.g., "24/28 checks passed (86%)")
- Comparison mode: when both versions run, diff table shows which checks differ

**Verification:** `npm run test:prompt-quality` runs against real LLM, produces score summary within 5 minutes.

---

## Scope Boundaries

### In scope

- V1 and V2 prompt grammar redesign
- Handler default alignment and logging
- Chrome extension feature toggle
- Golden dataset (10+ examples)
- Tier 1 structural tests (CI)
- Tier 2 quality tests (manual)

### Deferred to follow-up work

- Vocabulary section changes (conjugation engine, structured JSON output — see ideation ideas #3, #4)
- Surrounding context integration (see ideation idea #2)
- Firebase Remote Config for server-side A/B assignment
- Automated CI pipeline for Tier 2
- LLM-as-judge scoring
- Streaming-specific tests (SSE chunk boundaries)

---

## Risks & Dependencies

- **Golden dataset requires Japanese proficiency.** The 10+ examples need someone who can verify correct readings, grammar points, and translations. This is the main manual effort in the plan.
- **Tier 2 non-determinism.** LLM output varies between runs. The partial-match tolerance (R28) mitigates this, but scores will fluctuate. Expect ~5-10% variance between runs on the same prompt version.
- **V2 prompt token budget.** Comprehensive grammar (native intuition + similar patterns + register examples + literal decomposition) produces longer output per grammar point. With 5 points, V2 may approach the `max_tokens: 8192` limit for complex sentences. Monitor token usage in Tier 2 runs; if truncated, consider reducing the dynamic cap or making literal decomposition optional.

---

## Sources / Research

- Origin requirements: `docs/brainstorms/2026-06-09-prompt-evaluation-harness-requirements.md`
- Ideation context: `docs/ideation/2026-06-09-llm-prompt-quality-ideation.md`
- Current prompts: `japanese-alchemy-hosting/functions/src/models/systemPromptV1.ts`, `systemPromptV2.ts`
- LLM service: `japanese-alchemy-hosting/functions/src/services/llmService.ts`
- Handlers: `japanese-alchemy-hosting/functions/src/v1/explainStreamHandler.ts`, `explainCallable.ts`
- Chrome extension API call: `japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js` (line 205)
- Existing test patterns: `japanese-alchemy-hosting/functions/test/services/geminiService.test.ts`
- Prompt language research: FacetScore/Ryan Stenhouse (2025) — language-matched prompts improve accuracy by double digits
- Grammar prompt framework: OceanQuake "First-Principles Japanese Grammar" (2025) — six-part framework with native intuition and nuance maps
- Grammar hallucination analysis: Self-Taught Japanese (2025) — ~40% error rate in LLM Japanese grammar explanations
- Few-shot over-prompting: arXiv (Sep 2025) — buggy examples train model to reproduce errors
