/**
 * Integration tests for the client-side conjugation engine's wiring (U4).
 *
 * The onDone streaming-finalize callback enriches the raw stream with
 * enrichMarkdownWithConjugation() before writing it to lastResponse and handing
 * it to formatAnalysisResult(). onDone itself is embedded in sidepanel.js with
 * DOM/chrome dependencies and is not unit-testable in isolation, so these tests
 * exercise the composable contract onDone relies on: the enriched markdown
 * drives BOTH the rendered HTML and the saved-item detail, from a single pass.
 */
import { enrichMarkdownWithConjugation } from '../src/scripts/conjugation.js';
import { formatAnalysisResult } from '../src/sidepanel/sidepanel.js';

describe('conjugation integration (U4): enrich -> formatAnalysisResult', () => {
  // Post-redesign (U3) verb entry: the LLM emits 辭書形 + 動詞分類 and no forms.
  const newShapeFullText = `### 原句
  - 例文：{動|うご}く

### 單字分析
#### <單字>{動き|うごき}
  - 讀音：うごく
  - 重音：2
  - 動詞分類：五段動詞
  - 解釋：移動、活動
  - 辭書形：{動|うご}く

### 文法分析

#### <文法>〜として（N3）
- **接續形式**
  - 名詞 + として
`;

  test('enriched markdown flows into both the rendered HTML and the saved-item detail', () => {
    // Mirror onDone: enrich once, then format the enriched text.
    const enriched = enrichMarkdownWithConjugation(newShapeFullText);
    const result = formatAnalysisResult(enriched);

    // The conjugation table appears in the rendered HTML (ruby-converted).
    expect(result.html).toContain('<rb>動</rb>');
    expect(result.html).toContain('ます形');
    expect(result.html).toContain('使役受身形');

    // The same table is carried in the saved word's detail (what saveItems
    // persists and the webapp renders unchanged).
    const verb = result.json.words.find((w) => w.term.includes('動き'));
    expect(verb).toBeDefined();
    expect(verb.detail).toContain('辭書形：{動|うご}く');
    expect(verb.detail).toContain('ます形：{動|うご}きます');
    expect(verb.detail).toContain('使役受身形：{動|うご}かされる');
  });

  test('the enriched markdown lastResponse stores carries conjugation (Copy / Save-As)', () => {
    // Copy and Save-As read lastResponse verbatim; it must be the enriched text.
    const stored = enrichMarkdownWithConjugation(newShapeFullText);
    expect(stored).toContain('ます形：{動|うご}きます');
    expect(stored).toContain('使役受身形：{動|うご}かされる');
  });

  test('a cache-hit on an already-enriched stored response renders without double conjugation', () => {
    // On cache hit the stored (enriched) response goes straight to
    // formatAnalysisResult — it is never re-enriched, so the table is not
    // duplicated. (Enrichment idempotency is covered in conjugation.test.js.)
    const stored = enrichMarkdownWithConjugation(newShapeFullText);
    const result = formatAnalysisResult(stored);
    expect(result.html.split('ます形').length - 1).toBe(1);
    const verb = result.json.words.find((w) => w.term.includes('動き'));
    expect(verb.detail.split('ます形').length - 1).toBe(1);
  });

  test('regression: a fullText with no verbs enriches to itself and renders as before', () => {
    const noVerbs = `### 原句
  - 例文

### 單字分析
#### <單字>パソコン
  - 重音：1
  - 英文：Personal Computer
  - 解釋：電腦

### 文法分析
#### <文法>〜として（N3）
- 名詞 + として
`;
    const enriched = enrichMarkdownWithConjugation(noVerbs);
    expect(enriched).toBe(noVerbs); // no-op
    const result = formatAnalysisResult(enriched);
    expect(result.html).toContain('Personal Computer');
    expect(result.html).not.toContain('ます形');
  });

  test('degradation: enrichment that changes nothing leaves saveForLaterJson consistent with the HTML', () => {
    // When the engine adds conjugation, the json (saveForLaterJson) and html
    // both derive from the same enriched string, so they cannot desync (RISK-3).
    const enriched = enrichMarkdownWithConjugation(newShapeFullText);
    const result = formatAnalysisResult(enriched);
    const verb = result.json.words.find((w) => w.term.includes('動き'));
    const htmlHasForms = result.html.includes('ます形');
    const detailHasForms = verb.detail.includes('ます形');
    expect(htmlHasForms).toBe(detailHasForms);
    expect(htmlHasForms).toBe(true);
  });
});
