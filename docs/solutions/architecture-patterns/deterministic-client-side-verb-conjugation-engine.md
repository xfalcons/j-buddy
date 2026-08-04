---
title: Replace LLM Verb Conjugation with a Deterministic Client-Side Engine
date: 2026-08-04
category: architecture-patterns
module: japanese-alchemy-chrome-extension
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - "A Chrome-extension analysis flow asks an LLM to emit regular Japanese verb conjugation forms."
  - "The backend streams raw LLM markdown and should not buffer or parse the full response just to inject deterministic fields."
  - "Rendered, saved, copied, exported, and cached analysis output must stay consistent from one enriched markdown source."
related_components:
  - assistant
  - testing_framework
tags:
  - chrome-extension
  - japanese-conjugation
  - deterministic-engine
  - llm-boundary
  - streaming
  - markdown-enrichment
  - cache-invalidation
---

# Replace LLM Verb Conjugation with a Deterministic Client-Side Engine

## Context

Japanese verb conjugation is regular enough to be owned by code, while explanation text, word sense, pitch accent, and grammar analysis still benefit from the LLM. The durable pattern from the client-side conjugation work is to stop asking the LLM for the full displayed verb table and move those generated forms into a pure client-side enrichment pass.

Both prompt versions now ask the model for the fields the engine needs, then explicitly say not to output the nine generated conjugation forms (`japanese-alchemy-hosting/functions/src/models/systemPromptV1.ts:12`, `japanese-alchemy-hosting/functions/src/models/systemPromptV2.ts:12`). An older kanji-word instruction still asks for `て形` and `否定形`; the enrichment guard treats already-present form labels as old-shape output and skips those entries instead of duplicating them (`japanese-alchemy-hosting/functions/src/models/systemPromptV1.ts:14`, `japanese-alchemy-hosting/functions/src/models/systemPromptV2.ts:14`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:233`). The extension-side engine treats `動詞分類` and `辭書形` as structured inputs: `normalizeVerbClass()` accepts the prompt labels and tolerated variants, then normalizes them to `godan`, `ichidan`, `suru`, or `kuru` (`japanese-alchemy-chrome-extension/src/scripts/conjugation.js:23`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:33`).

This keeps the LLM responsible for choosing the lemma and class, not for generating a repetitive morphology table. It also keeps pitch accent out of the rule engine because the implementation documents that accent is lexical and not derivable by conjugation rules (`japanese-alchemy-chrome-extension/src/scripts/conjugation.js:16`).

## Guidance

Use a two-layer design:

1. Put the language rules in a pure core.
2. Put product-format splicing in a small markdown enrichment layer.
3. Call enrichment exactly once at the stream-finalization boundary, before persistent or reusable consumers see the analysis.
4. Version the cache key when the stored response shape changes.
5. Decline uncertain inputs without throwing or partially corrupting markdown.

The pure core should return all product-visible forms or `null`; never throw. In this branch, `conjugate()` returns the nine forms or `null` for unsupported classes, malformed forms, empty forms, and ending/class mismatches (`japanese-alchemy-chrome-extension/src/scripts/conjugation.js:121`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:134`). The rule tables cover godan endings, ichidan suffixes, suru, and kuru (`japanese-alchemy-chrome-extension/src/scripts/conjugation.js:72`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:85`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:92`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:99`), with explicit handling for 行く, honorific る-verbs, and ruby-bearing 来る (`japanese-alchemy-chrome-extension/src/scripts/conjugation.js:105`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:110`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:196`).

The enrichment layer should parse the product's existing markdown structure instead of doing broad string replacement. Here `enrichMarkdownWithConjugation()` targets only the `### 單字分析` section, splits by `#### ` entries, and leaves other sections untouched (`japanese-alchemy-chrome-extension/src/scripts/conjugation.js:329`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:356`). For each entry, `enrichEntry()` looks for `辭書形` and `動詞分類`, skips entries that already have a conjugation form, and injects generated form lines immediately after the dictionary-form line (`japanese-alchemy-chrome-extension/src/scripts/conjugation.js:276`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:286`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:303`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:315`).

Keep streaming responsive by rendering raw accumulated markdown during the stream, then enrich only the completed full text. The sidepanel progressively renders chunks through `renderStreamingPreview()` (`japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js:166`, `japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js:220`), while the done callback enriches final text before writing `lastResponse`, setting the cache key, formatting HTML/JSON, and showing the final result (`japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js:228`, `japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js:235`, `japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js:236`, `japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js:246`). This preserves streaming UX without forcing every partial chunk through a transformer that depends on complete entries.

Make enriched markdown the single source of truth. The final enriched string is stored in `lastResponse`; cache hits render that stored response; Save-As and Copy read it verbatim; and Save For Later persists word detail produced from the same enriched formatting pass (`japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js:196`, `japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js:236`, `japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js:247`). That placement prevents render/save/copy/export/cache divergence.

Invalidate old cached responses when the stored shape changes. The context cache key has a `cgv1` version segment specifically so upgraded clients cannot serve pre-engine `lastResponse` values that lack generated conjugation tables (`japanese-alchemy-chrome-extension/src/scripts/surroundingContext.js:102`, `japanese-alchemy-chrome-extension/src/scripts/surroundingContext.js:109`). The same key includes selected text and surrounding context, so context changes for the same selection are cache misses (`japanese-alchemy-chrome-extension/src/scripts/surroundingContext.js:111`, `japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js:190`).

Preserve furigana at the engine boundary. The rule core strips ruby only for reading-based anomaly detection, but otherwise preserves ruby segments and transforms only trailing okurigana (`japanese-alchemy-chrome-extension/src/scripts/conjugation.js:54`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:148`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:218`). The display pipeline already converts `{漢字|かんじ}` to `<ruby>` for HTML and converts headings back for checkbox values (`japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js:15`, `japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js:28`, `japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js:93`, `japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js:111`), so enriched markdown should stay in `{kanji|reading}` format.

## Why This Matters

Moving conjugation into a deterministic engine removes a high-volume source of LLM variance without changing the user's visible workflow. The model can still disambiguate readings, senses, grammar points, and class/lemma selection with optional context. The client then expands the stable morphology table locally.

The important product lesson is that correctness is not only the rule table. The rule table must be inserted at the right lifecycle point. If enrichment happened only in the renderer, Save For Later, Copy, Save-As, cached responses, and the webapp could diverge. If enrichment happened during partial streaming, incomplete entries could be transformed unpredictably. Finalizing once in `onDone`, before storing and formatting, creates one enriched artifact for all downstream paths.

Graceful degradation is equally important. The engine declines unrecognized verb classes, malformed ruby, missing `辭書形`, class/ending mismatches, already-enriched entries, old-shape LLM output, absent `### 單字分析`, and non-string input without throwing (`japanese-alchemy-chrome-extension/src/scripts/conjugation.js:135`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:145`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:291`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:294`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:297`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:300`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:342`, `japanese-alchemy-chrome-extension/src/scripts/conjugation.js:348`). A bad or unusual verb entry remains usable markdown instead of breaking the whole analysis.

## When to Apply

Apply this pattern when an LLM output contains a deterministic subproblem that is:

- Regular enough to encode as rules.
- Small enough to test exhaustively or with representative coverage.
- Downstream-visible in multiple places, such as render, save, copy, export, cache, or API persistence.
- Fed by a few structured fields the LLM can still provide reliably.

For Japanese verb conjugation in this repo, the input contract is `動詞分類` plus `辭書形`. The output contract is the nine displayed forms. Keep the LLM prompt focused on class/lemma and explanations, and keep the engine focused on morphology.

Do not apply this pattern to lexical or context-dependent knowledge that the rule engine cannot derive. This implementation intentionally leaves pitch accent with the LLM (`japanese-alchemy-chrome-extension/src/scripts/conjugation.js:16`).

## Examples

Prompt-side contract after the engine:

```text
單字分析...列出...動詞分類...解釋...辭書形...
注意：動詞的各種活用形（ます形、た形、ない形、て形、意向形、命令形、使役形、受身形、使役受身形）由系統自動產生，請勿輸出。
```

Client-side enrichment target:

```markdown
### 單字分析
#### <單字>{動き|うごき}
  - 讀音：うごく
  - 重音：2
  - 動詞分類：五段動詞
  - 解釋：移動、活動
  - 辭書形：{動|うご}く
```

Generated result:

```markdown
  - 辭書形：{動|うご}く
  - ます形：{動|うご}きます
  - た形：{動|うご}いた
  - ない形：{動|うご}かない
  - て形：{動|うご}いて
  - 意向形：{動|うご}こう
  - 命令形：{動|うご}け
  - 使役形：{動|うご}かせる
  - 受身形：{動|うご}かれる
  - 使役受身形：{動|うご}かされる
```

Lifecycle pattern:

```js
// Stream chunks: render quickly from accumulated text.
renderStreamingPreview(proseElement, fullText);

// Stream done: enrich once, then use this as the shared source.
const enrichedText = enrichMarkdownWithConjugation(fullText);
localStorage.setItem('lastResponse', enrichedText);
const analysisResult = formatAnalysisResult(enrichedText);
saveForLaterJson = analysisResult.json;
proseElement.innerHTML = analysisResult.html;
```

The tests encode the contract. Unit coverage checks class normalization, all modern godan final-kana rows, ichidan, suru, kuru, documented anomalies, ruby preservation, malformed inputs, idempotency, old-shape output, missing fields, multiple entries, structural targeting, and no-section/no-string degradation (`japanese-alchemy-chrome-extension/tests/conjugation.test.js:30`, `japanese-alchemy-chrome-extension/tests/conjugation.test.js:57`, `japanese-alchemy-chrome-extension/tests/conjugation.test.js:82`, `japanese-alchemy-chrome-extension/tests/conjugation.test.js:112`, `japanese-alchemy-chrome-extension/tests/conjugation.test.js:138`, `japanese-alchemy-chrome-extension/tests/conjugation.test.js:165`, `japanese-alchemy-chrome-extension/tests/conjugation.test.js:218`, `japanese-alchemy-chrome-extension/tests/conjugation.test.js:250`, `japanese-alchemy-chrome-extension/tests/conjugation.test.js:286`, `japanese-alchemy-chrome-extension/tests/conjugation.test.js:359`, `japanese-alchemy-chrome-extension/tests/conjugation.test.js:366`, `japanese-alchemy-chrome-extension/tests/conjugation.test.js:378`, `japanese-alchemy-chrome-extension/tests/conjugation.test.js:418`, `japanese-alchemy-chrome-extension/tests/conjugation.test.js:433`, `japanese-alchemy-chrome-extension/tests/conjugation.test.js:490`). Integration coverage verifies that enriched markdown flows into both rendered HTML and saved-item detail, that `lastResponse` carries conjugation for Copy and Save-As, cache-hit rendering does not double-conjugate, no-verb markdown stays unchanged, and HTML/detail stay consistent (`japanese-alchemy-chrome-extension/tests/conjugationIntegration.test.js:34`, `japanese-alchemy-chrome-extension/tests/conjugationIntegration.test.js:53`, `japanese-alchemy-chrome-extension/tests/conjugationIntegration.test.js:60`, `japanese-alchemy-chrome-extension/tests/conjugationIntegration.test.js:71`, `japanese-alchemy-chrome-extension/tests/conjugationIntegration.test.js:92`).

## Related

- Direct plan: `docs/plans/2026-06-16-001-feat-client-side-conjugation-engine-plan.md`
- Adjacent prompt-quality plan: `docs/plans/2026-06-09-001-feat-prompt-evaluation-harness-plan.md`
- Engine and enrichment layer: `japanese-alchemy-chrome-extension/src/scripts/conjugation.js`
- Streaming lifecycle integration: `japanese-alchemy-chrome-extension/src/sidepanel/sidepanel.js`
- Cache-key versioning: `japanese-alchemy-chrome-extension/src/scripts/surroundingContext.js`
- Reduced prompt contract: `japanese-alchemy-hosting/functions/src/models/systemPromptV1.ts`, `japanese-alchemy-hosting/functions/src/models/systemPromptV2.ts`
