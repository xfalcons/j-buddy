---
date: 2026-06-09
topic: prompt-evaluation-harness
---

# Prompt Evaluation Harness & V1/V2 Grammar Redesign

## Summary

Redesign the grammar analysis section of V1 and V2 prompts to be genuinely different (concise vs. comprehensive), fix known bugs (heading mismatch, invented examples), and build a two-tier Jest evaluation harness to A/B test which depth level drives higher save rate and review streaks. Both versions improve over the current identical prompts — the test measures depth preference, not quality regression.

## Problem Frame

V1 and V2 prompts are byte-for-byte identical — this went unnoticed because there is no test infrastructure for prompt output quality. The grammar section has specific bugs: the example heading says `〜かいがある` but the explanation is about `〜として`; grammar examples use invented sentences unrelated to the source text; and all examples are textbook-formal rather than natural Japanese. Research estimates ~40% of LLM Japanese grammar explanations contain errors, making grounding constraints essential. The hardcoded cap of 2 grammar points forces the model to skip teachable moments in complex sentences.

---

## Key Decisions

**Both versions improve over current, different depth.** V1 and V2 each fix the known bugs (heading mismatch, invented examples, textbook-only style) but differ in grammar analysis depth. V1 is concise; V2 is comprehensive. The A/B test measures whether learners prefer brief explanations or deep analysis — not whether the new prompts are better than the old (they both are).

**Prompt language stays Traditional Chinese.** Research shows language-matched prompts (Chinese instructions + Japanese grammar terms) improve accuracy by double digits over English for Japanese text analysis. Processing is 25-35% faster with matched language.

**Grammar explanations grounded in the user's sentence first.** Both versions must explain how the grammar pattern functions in the user's actual input sentence before providing additional examples. This eliminates the current problem where grammar examples use completely unrelated vocabulary.

**Dynamic grammar cap replaces fixed limit of 2.** V1 allows 1-3 grammar points; V2 allows 1-5. The cap scales with sentence complexity instead of being arbitrary.

**Few-shot example moved out of system prompt.** The current embedded example contains bugs that train the model to reproduce errors. Both versions use corrected, minimal examples.

---

## Requirements

### V1 Prompt — Concise Grammar

R1. V1's grammar section identifies 1-3 JLPT grammar points present in the input sentence (replacing the fixed cap of 2).

R2. For each grammar point, V1 provides: pattern name with JLPT level, formation rule (接續形式), usage explanation grounded in the user's actual sentence first, and 1-2 additional natural example sentences with `{kanji|reading}` ruby annotations.

R3. V1's grammar heading must match its content — the example in the prompt must demonstrate correct heading-content alignment.

R4. V1's additional examples use natural modern Japanese (not textbook-only style), labeled by register when the pattern's usage differs between casual and formal contexts.

R5. V1 keeps the existing vocabulary analysis unchanged (same conjugation table format, same katakana handling) to isolate the grammar change in the A/B test.

### V2 Prompt — Comprehensive Grammar

R6. V2 includes everything in V1 (R1-R5) plus the following additions per grammar point.

R7. V2 identifies 1-5 JLPT grammar points (wider range for complex sentences).

R8. V2 adds a **native speaker intuition** field: tone, register, and what the pattern "feels like" to a native speaker (母語者語感).

R9. V2 adds a **similar pattern comparison** when pedagogically useful: one commonly confused pattern with the key difference in meaning/nuance and a pair of contrastive example sentences.

R10. V2 adds **register-labeled examples** (カジュアル/丁寧/ビジネス) showing the pattern across different politeness levels.

R11. V2 adds a **literal decomposition** field: break the grammar pattern into component parts and reconstruct the literal meaning element by element.

### Feature Toggle for A/B Testing

R12. The `prompt` field in `ExplainRequest` selects between `"v1"` (concise) and `"v2"` (comprehensive). Both endpoints (`explain` and `explainStream`) honor this field.

R13. The Chrome extension sends `"v2"` by default (matching current behavior). A/B test assignment can override this per-user via a configuration flag stored in `chrome.storage.local`.

R14. The backend logs which prompt version was used alongside the request, enabling post-hoc analysis of save rate and review streaks by version.

R15. Both prompt versions share the same output section structure (`### 原句`, `### 單字分析`, `### 文法分析`) so the client-side parser works unchanged with either version.

### Golden Dataset

R16. The harness includes a golden dataset of Japanese sentences stored as JSON fixtures, each with an input sentence and a set of expected binary checks.

R17. The dataset covers at least these difficulty axes: kanji reading ambiguity (homographs with multiple readings), passive/causative/causative-passive patterns, katakana loanwords, keigo (honorific/humble forms), conditionals (と/ば/たら/なら), sentences near the 500-character limit, and short selections (2-10 characters).

R18. Each golden example specifies checks for: ruby annotation format (`{kanji|reading}` present and well-formed), expected vocabulary terms, expected grammar points (at least the primary JLPT pattern(s) present), section structure (all three headings present), and parseability (the full output can be parsed by `formatAnalysisResult` without errors).

R19. The dataset starts with at least 10 golden examples and is designed to grow as prompt iteration reveals new failure modes.

### Evaluation Harness — Tier 1: Structural Validation (CI)

R20. Tier 1 tests use pre-recorded LLM responses (markdown fixtures) as mock data — no real API calls.

R21. Tier 1 validates output structure for both V1 and V2 prompts: section headings present, `{kanji|reading}` syntax well-formed, vocabulary and grammar entries extractable by the client parser, and grammar heading matches its content.

R22. Tier 1 runs as part of `npm test` in `functions/` alongside existing tests.

R23. When a structural test fails, the error message identifies which check failed and which golden example triggered it.

### Evaluation Harness — Tier 2: Quality Validation (Manual/Nightly)

R24. Tier 2 tests call the real LLM (via `createLlmService()`) with each golden example's input sentence and score the live output against the example's binary checklist.

R25. Tier 2 is excluded from the default `npm test` run and invoked via a separate script (e.g., `npm run test:prompt-quality`).

R26. The Tier 2 runner accepts `--provider` (gemini or zai) and `--prompt-version` (v1 or v2) flags, enabling head-to-head comparison of the two prompt versions.

R27. Tier 2 outputs a per-example pass/fail summary for each check, plus an overall score (percentage of checks passed). When run against both versions, it produces a comparison showing which checks differ.

R28. Tier 2 is tolerant of non-determinism: vocabulary and grammar checks allow partial matches rather than requiring exact match of the full output.

---

## Scope Boundaries

### In scope

- V1 and V2 prompt grammar redesign (concise vs. comprehensive)
- Fix known bugs (heading mismatch, invented examples, textbook-only style)
- Feature toggle mechanism for A/B testing (R12-R15)
- Golden dataset curation (initial 10+ examples)
- Tier 1 structural tests (mocked, CI)
- Tier 2 quality tests (real LLM, manual)
- Binary checklist scoring with per-check pass/fail
- Prompt version comparison support

### Deferred for later

- LLM-as-judge scoring (the binary checklist is sufficient to start)
- Automated CI pipeline for Tier 2 (requires API key management and cost budget)
- Prompt optimization loops (auto-tuning prompts based on scores)
- Streaming-specific tests (validating SSE chunk boundaries)
- Vocabulary section changes (conjugation engine, structured JSON output — see ideation ideas #3 and #4)
- Surrounding context integration (see ideation idea #2)

### Outside this work

- Changing the client-side parser (orthogonal to evaluation)
- Adding new LLM providers (orthogonal)
- Changing the vocabulary analysis section (isolated to grammar for clean A/B test)

---

## Success Criteria

- A prompt change can be evaluated in under 5 minutes by running Tier 2 and reading the summary.
- Tier 1 catches any output format regression that would break `formatAnalysisResult` parsing.
- V1 and V2 produce measurably different output (different grammar depth, different cap behavior) — the evaluation harness can detect the difference.
- Both V1 and V2 fix the heading mismatch bug and produce grammar examples grounded in the user's sentence.
- Adding a new golden example requires only a new JSON fixture — no test code changes.

---

## Dependencies / Assumptions

- The golden dataset requires someone with Japanese proficiency to curate expected outputs (correct readings, grammar points, translations).
- Tier 2 requires API access to at least one LLM provider with valid credentials.
- The `formatAnalysisResult` parser in the Chrome extension is the contract the harness validates against — if the parser changes, the golden examples may need updating.
- Non-determinism in LLM output means Tier 2 scores will fluctuate between runs; the checklist is designed to be tolerant of minor variation.
- The A/B test requires enough traffic to produce statistically meaningful results on save rate differences between V1 and V2.
- Both prompts remain in Traditional Chinese (instructions) + Japanese (grammar terms/examples). Research shows this combination is near-optimal for Japanese text analysis accuracy.

---

## Sources / Research

- Ideation context: `docs/ideation/2026-06-09-llm-prompt-quality-ideation.md`
- Current prompt: `japanese-alchemy-hosting/functions/src/models/systemPromptV2.ts`
- LLM service interface: `japanese-alchemy-hosting/functions/src/services/llmService.ts`
- Client parser: `japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js` (`formatAnalysisResult`)
- Existing test patterns: `japanese-alchemy-hosting/functions/test/services/geminiService.test.ts`
- Product strategy: `STRATEGY.md` (explanation quality track)
- Grammar prompt framework: OceanQuake "First-Principles Japanese Grammar" (Medium, 2025) — six-part framework with native intuition, nuance maps, graduated examples
- Grammar hallucination analysis: Self-Taught Japanese (2025) — ~40% error rate in LLM Japanese grammar explanations
- Prompt language research: Ryan Stenhouse / FacetScore (2025) — language-matched prompts improve accuracy by double digits, 25-35% faster processing
- Few-shot over-prompting: arXiv (Sep 2025) — performance peaks at 5-20 examples then declines; buggy examples train model to reproduce errors
- JLPT grammar reference: Shin Kanzen Master textbook series — similar pattern comparison is the most pedagogically valuable section
