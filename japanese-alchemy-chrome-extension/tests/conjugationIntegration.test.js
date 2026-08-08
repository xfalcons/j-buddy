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

  const usageOrientedFullText = `### 原句
  - {新|あたら}しい{制度|せいど}が{企業|きぎょう}の{成長|せいちょう}を{後押|あとお}ししている。

### 單字分析
#### <單字>{後押|あとお}しする
  - 讀音：あとおしする
  - 重音：2
  - 動詞分類：サ變動詞
  - 解釋：推動、支持某事往前進展
  - 辭書形：{後押|あとお}しする
  - 原句中的意思：在本句中表示制度幫助企業成長往前推進。
  - 常見搭配／句型框架：〜を{後押|あとお}しする；{成長|せいちょう}を{後押|あとお}しする。
  - 語感／語域：偏新聞、商務、正式書面語。
  - 自然例句：{政府|せいふ}の{支援|しえん}が{地域経済|ちいきけいざい}の{成長|せいちょう}を{後押|あとお}ししている。（政府支援正在推動地方經濟成長。）
  - 造句模板：A が B を{後押|あとお}しする。
  - 回想題：「推動地方經濟成長」可說成「{地域経済|ちいきけいざい}の{成長|せいちょう}を＿＿する」。

### 文法分析
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

  test('usage-oriented V2 fields survive enrichment after generated forms are injected', () => {
    const enriched = enrichMarkdownWithConjugation(usageOrientedFullText);
    const result = formatAnalysisResult(enriched);
    const word = result.json.words.find((w) => w.term.includes('後押'));

    expect(word).toBeDefined();
    expect(word.detail).toContain('辭書形：{後押|あとお}しする');
    expect(word.detail).toContain('ます形：{後押|あとお}しします');
    expect(word.detail).toContain('使役受身形：{後押|あとお}しさせられる');
    expect(word.detail.indexOf('辭書形：{後押|あとお}しする')).toBeLessThan(
      word.detail.indexOf('ます形：{後押|あとお}しします')
    );
    expect(word.detail.indexOf('使役受身形：{後押|あとお}しさせられる')).toBeLessThan(
      word.detail.indexOf('原句中的意思：在本句中表示制度幫助企業成長往前推進。')
    );
    expect(word.detail).toContain('常見搭配／句型框架：〜を{後押|あとお}しする');
    expect(word.detail).toContain('語感／語域：偏新聞、商務、正式書面語。');
    expect(word.detail).toContain('造句模板：A が B を{後押|あとお}しする。');
    expect(word.detail).toContain('回想題：「推動地方經濟成長」');

    expect(result.html).toContain('ます形');
    expect(result.html).toContain('造句模板');
    expect(result.html).toContain('<rb>後押</rb>');
    expect(result.html).toContain('<rb>地域経済</rb>');
  });
});
