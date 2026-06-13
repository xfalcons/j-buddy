---
date: 2026-06-09
topic: llm-prompt-quality
focus: Improving LLM prompt quality for Japanese text analysis, or finding better approaches
mode: repo-grounded
---

# Ideation: Improving LLM Prompt Quality for J-Buddy

## Grounding Context

**Codebase Context:** J-Buddy monorepo (Chrome Extension + Firebase Backend + Next.js Webapp). TypeScript, Node.js 22, Firebase. Pluggable LLM service (Gemini/ZAI via OpenAI-compatible endpoint). SSE streaming pipeline. V1/V2 prompts are identical (106 lines, Traditional Chinese, "senior Japanese teacher" role for JLPT N1-N3). Output: ruby annotations `{kanji|reading}`, markdown sections, 14 verb conjugation forms per verb, 2 grammar points max. `temperature: 0.1`, `max_tokens: 8192`.

**Pain points identified:** V1=V2 with no differentiation. Only 2 grammar points per analysis. Static examples with no real-world contrast. Conjugation explosion (14 forms) drives token cost. No surrounding text context. Provider-specific features unused (Gemini thinking). No structured output enforcement. Fragile regex-based markdown parsing in client.

**External context:** Structured Outputs (JSON Schema) recommended but Gemini may ignore schemas via OpenAI-compatible endpoint. Multi-pass pipelines (generate→critique→refine) are effective. RAG with grammar references reduces hallucination. Zero-shot CoT in Japanese may hurt with modern models. No competitor uses LLMs — J-Buddy is novel in this space. Compiler analogy: separate grammar identification from explanation generation.

**Product strategy:** Ground every explanation in the real text the user is reading. Three tracks: in-context reading experience, spaced review & retention, explanation quality.

## Topic Axes

1. Prompt structure & format enforcement
2. Content depth & pedagogy
3. Context grounding
4. Multi-step pipelines
5. Prompt iteration & evaluation

## Ranked Ideas

### 1. Build a Prompt Evaluation Harness with Golden Examples
**Description:** Create a fixed set of 20-30 Japanese sentences covering key difficulty axes (kanji ambiguity, passive/causative patterns, katakana loanwords, keigo, conditional forms, homograph disambiguation) with hand-verified expected outputs. Write a Jest test that sends each sentence through the prompt and scores output on: ruby annotation format correctness, vocabulary recall, grammar point identification, output parseability. Run on every prompt change to catch regressions.
**Axis:** 5 — Prompt iteration & evaluation
**Basis:** `direct:` V1 and V2 prompts are byte-for-byte identical (107 lines each) — this went unnoticed because there is zero test infrastructure for prompt quality. The existing test suite tests the client parser, not the LLM output. `external:` Anthropic and OpenAI both recommend evaluation datasets as foundational practice; DSPy and Promptfoo are frameworks built around this.
**Rationale:** Every other idea modifies the prompt. Without an evaluation harness, every change is a blind deployment. This unlocks safe iteration on everything else.
**Downsides:** Requires manual curation of test sentences and expected outputs. Ongoing maintenance as prompt evolves.
**Confidence:** 95%
**Complexity:** Medium
**Status:** Explored

### 2. Send Surrounding Sentence Context from the Page
**Description:** Extend the content script to capture ~100 characters before and after the user's selection from the DOM. Send as a separate `context_before`/`context_after` field in the request. The prompt instructs the LLM to use this context for disambiguation (homograph readings, grammar pattern identification, word sense) while keeping analysis focused on the selected text.
**Axis:** 3 — Context grounding
**Basis:** `direct:` Content script sends only `window.getSelection().toString()` — pure selected text with zero surrounding context. Japanese is highly context-dependent. `reasoned:` The product strategy says "ground every explanation in the real text the user is reading" — but the LLM is blind to 99% of that text.
**Rationale:** Highest impact-to-effort ratio. Content script already has DOM access. Negligible token cost. Dramatically improves disambiguation accuracy.
**Downsides:** Minor privacy consideration (sending more page content). Need to decide context window size.
**Confidence:** 92%
**Complexity:** Low
**Status:** Unexplored

### 3. Replace LLM Conjugation with a Server-Side Engine
**Description:** Build a deterministic TypeScript conjugation engine that produces all verb forms from the dictionary form + verb class (godan, ichidan, suru, kuru). Remove conjugation generation from the LLM prompt entirely. The LLM outputs the dictionary form and verb class; the backend appends the conjugation table to the response. Japanese conjugation is 100% regular — exactly 4 verb classes with fully predictable rules.
**Axis:** 1 — Prompt structure & format enforcement
**Basis:** `direct:` The prompt demands 14 forms per verb. Lines 37-41 show the LLM copying generic template text verbatim across verbs. `reasoned:` Japanese conjugation is one of the most regular morphological systems — using an LLM for it is like using an LLM to do arithmetic.
**Rationale:** Single biggest token waste (~40% of output). Deterministic code is faster, cheaper, and more accurate. Frees prompt budget for higher-value content.
**Downsides:** Requires building and testing a conjugation engine. Need backward compatibility with existing saved vocabulary in Firestore.
**Confidence:** 88%
**Complexity:** Medium
**Status:** Unexplored

### 4. Enforce Structured JSON Output with a Schema
**Description:** Define a JSON schema for the analysis result (annotated sentence, vocabulary array with typed fields, grammar array). Use OpenAI-compatible `response_format` to enforce schema compliance. Server-side serializer converts structured JSON to `{kanji|reading}` markdown for the client, preserving the rendering contract.
**Axis:** 1 — Prompt structure & format enforcement
**Basis:** `direct:` The client parser (`sidepanel.js` lines 48-86) splits on `### ` and `#### ` headings using regex with no error handling — any heading deviation silently breaks save. `external:` Both Gemini and OpenAI-compatible endpoints support `response_format` with JSON Schema.
**Rationale:** Eliminates an entire class of parsing bugs. Makes output contract machine-verifiable. Enables safe prompt iteration without risking the client.
**Downsides:** Gemini may ignore schemas via OpenAI-compatible endpoint (native API is more reliable). Migration requires server-side serializer. Streaming JSON differs from streaming markdown.
**Confidence:** 82%
**Complexity:** Medium-High
**Status:** Unexplored

### 5. Remove the Hardcoded 2-Grammar-Point Cap
**Description:** Replace the fixed cap of "只能列出二則分析" with a dynamic instruction: "List all JLPT N1-N3 grammar patterns present in the source text, up to a maximum of 5." The client parser already handles any number of grammar entries — the cap exists only in the prompt.
**Axis:** 2 — Content depth & pedagogy
**Basis:** `direct:` Line 14 of `systemPromptV2.ts` hardcodes the cap. The example source sentence contains at minimum 4 JLPT-level patterns that would be teachable moments.
**Rationale:** Grammar analysis is the highest-value output for intermediate learners. Capping at 2 forces the model to skip patterns the user actually needs help with.
**Downsides:** More grammar points means more output tokens and slightly longer generation time.
**Confidence:** 90%
**Complexity:** Low
**Status:** Unexplored

### 6. Ground Grammar Explanations in the User's Actual Sentence
**Description:** Require grammar explanations to first demonstrate the pattern using the actual substring from the user's input, then optionally provide one additional example. Change from "here's a grammar rule with an invented example" to "in your sentence, here's how this pattern works."
**Axis:** 3 — Context grounding
**Basis:** `direct:` Lines 82-105 show grammar examples using completely unrelated vocabulary (profits, schools, environmental protection) while the source sentence is about manufacturing/logistics. The grammar section is the least grounded part of the output.
**Rationale:** Showing grammar via unrelated vocabulary creates double cognitive load. Anchoring in the user's actual text directly serves the core product strategy.
**Downsides:** Slightly constrains example generation — but this constraint is the point.
**Confidence:** 93%
**Complexity:** Low
**Status:** Unexplored

### 7. Two-Pass Pipeline: Fast Gloss Then Deep Analysis
**Description:** Split the single monolithic LLM call into two sequential calls. Pass 1: annotated sentence with ruby + natural translation (~200 tokens, ~2 seconds). Pass 2: full vocabulary/grammar breakdown. Pass 1 streams immediately; Pass 2 streams into a collapsible section. Decouples "read this now" from "study this deeply."
**Axis:** 4 — Multi-step pipelines
**Basis:** `direct:` The streaming handler makes one LLM call streaming all output linearly. A 3-verb, 2-grammar analysis consumes 4,000-6,000 tokens (10-20 seconds). `reasoned:` User's primary need is understanding the sentence quickly; deep analysis is secondary.
**Rationale:** Dramatically improves perceived latency (useful content in ~2s vs ~10-20s). The SSE infrastructure already supports progressive rendering.
**Downsides:** Two sequential LLM calls increases total cost. Need to handle pass transition in client UI.
**Confidence:** 78%
**Complexity:** Medium-High
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| C | Fewer conjugation forms in prompt | Subsumed by idea #3 (server-side engine eliminates the problem entirely) |
| G | RAG grammar reference corpus | High complexity (curating 600 entries, retrieval infra), weaker basis (no production hallucination evidence), better as future brainstorm topic |
| H | Increase Gemini thinking budget | Too narrow for standalone ideation — parameter to test within evaluation harness |
| I | Kill V1 / clean up versioning | Housekeeping chore, not ideation-worthy |
| J | JLPT-level adaptive output | Scope overrun — adds settings UI and API contract changes beyond prompt quality |
| K | Inverted pyramid streaming order | Subsumed by idea #7 (multi-pass naturally produces importance-ordered output) |
| N | Prompt-as-function refactoring | Implementation detail that doesn't change output quality |
