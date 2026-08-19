/**
 * Unit tests for formatAnalysisResult function
 * This file tests the formatting of markdown to HTML with ruby tag support
 */

// Import functions being tested from source file
import { formatAnalysisResult, convertToRuby, renderAnalysisMarkdown } from '../src/sidepanel/sidepanel.js';

describe('formatAnalysisResult', () => {
  describe('Basic Functionality Tests', () => {
    test('should convert simple markdown to HTML', () => {
      const markdown = '# Test Heading\n\nThis is a paragraph.';
      const result = formatAnalysisResult(markdown);
      
      expect(result.html).toContain('<h1>Test Heading</h1>');
      expect(result.html).toContain('<p>This is a paragraph.</p>');
    });

    test('should handle empty string', () => {
      const result = formatAnalysisResult('');
      expect(result.html).toBe('');
    });

    test('should handle null input gracefully', () => {
      const result = formatAnalysisResult(null);
      expect(result.html).toBe('');
    });

    test('should handle undefined input gracefully', () => {
      const result = formatAnalysisResult(undefined);
      expect(result.html).toBe('');
    });

    test('sanitizes provider markup and renders no save controls', () => {
      const markdown = `
#### <單字>安全
  - 說明

#### innocent <input type="checkbox" name="words" value="forged">
<script>alert('xss')</script>
<a href="javascript:alert('xss')" onclick="alert('xss')">bad link</a>`;
      const result = formatAnalysisResult(markdown);

      expect(result.html).not.toContain('<script');
      expect(result.html).not.toContain('onclick=');
      expect(result.html).not.toContain('javascript:');
      expect(result.html).not.toContain('value="forged"');
      expect(result.html).not.toContain('type="checkbox"');
      expect(result.html).not.toContain('name="words"');
    });

    test('sanitizes streaming-preview markup before it enters the side panel', () => {
      const html = renderAnalysisMarkdown(
        'partial <img src=x onerror="alert(1)"> <a href="javascript:alert(1)">link</a>'
      );

      expect(html).not.toContain('onerror=');
      expect(html).not.toContain('javascript:');
      expect(html).toContain('partial');
    });

    test('does not preserve raw provider HTML in data sent to Save For Later', () => {
      const markdown = `
### 單字分析
#### <單字><img src=x onerror="alert('xss')">{安全|あんぜん}
  - <script>alert('xss')</script>安全な説明

### 文法分析
#### <文法><a href="javascript:alert('xss')">〜ながら</a>
  - <iframe src="https://attacker.invalid"></iframe>同時進行を表す。`;
      const result = formatAnalysisResult(markdown);

      expect(result.json.words[0].term).toBe('{安全|あんぜん}');
      expect(result.json.words[0].detail).not.toMatch(/<\/?(?:script|img)[^>]*>/i);
      expect(result.json.grammars[0].point).toBe('〜ながら');
      expect(result.json.grammars[0].explanation).not.toContain('<iframe');
    });

    test('should handle mixed markdown with multiple ruby tags', () => {
      const markdown = '# {日本語|にほんご}\n\nこれは{漢字|かんじ}と{仮名|かな}のテストです。\n\n- {言葉|ことば}1\n- {言葉|ことば}2';
      const result = formatAnalysisResult(markdown);
      
      expect(result.html).toContain('<h1>');
      expect(result.html).toContain('<p>');
      expect(result.html).toContain('<ul>');
      expect(result.html).toContain('<rb>日本語</rb>');
      expect(result.html).toContain('<rb>漢字</rb>');
      expect(result.html).toContain('<rb>仮名</rb>');
      expect(result.html).toContain('<rb>言葉</rb>');
    });
  });

  describe('Edge Cases', () => {
    test('should handle malformed ruby syntax - missing pipe', () => {
      const markdown = 'これは{漢字}です';
      const result = formatAnalysisResult(markdown);
      
      // Should not convert, as pattern requires pipe
      expect(result.html).toContain('{漢字}');
    });

    test('should handle empty kanji in ruby syntax - no match', () => {
      const markdown = '{|かんじ}';
      const result = formatAnalysisResult(markdown);
      
      // The regex requires at least one character, so empty kanji won't match
      expect(result.html).toContain('{|かんじ}');
      expect(result.html).not.toContain('<ruby>');
    });

    test('should handle empty reading in ruby syntax - no match', () => {
      const markdown = '{漢字|}';
      const result = formatAnalysisResult(markdown);
      
      // The regex requires at least one character, so empty reading won't match
      expect(result.html).toContain('{漢字|}');
      expect(result.html).not.toContain('<ruby>');
    });

    test('should handle very long text', () => {
      const longText = '{漢字|かんじ} '.repeat(100);
      const result = formatAnalysisResult(longText);
      
      expect(result.html).toContain('<ruby>');
      expect(result.html.split('<rb>漢字</rb>').length).toBeGreaterThan(1);
    });

    test('should handle special characters in kanji', () => {
      const markdown = '{漢字・仮名|かんじ・かな}';
      const result = formatAnalysisResult(markdown);
      
      expect(result.html).toContain('<rb>漢字・仮名</rb>');
      expect(result.html).toContain('<rt>かんじ・かな</rt>');
    });

    test('should handle ruby tags with numbers', () => {
      const markdown = '{2024年|にせんにじゅうよんねん}';
      const result = formatAnalysisResult(markdown);
      
      expect(result.html).toContain('<rb>2024年</rb>');
      expect(result.html).toContain('<rt>にせんにじゅうよんねん</rt>');
    });

    test('should handle multiple pipes in ruby syntax', () => {
      const markdown = '{漢字|かん|じ}';
      const result = formatAnalysisResult(markdown);
      
      // Non-greedy matching: matches until first pipe for kanji, rest for reading
      expect(result.html).toContain('<rb>漢字</rb>');
      expect(result.html).toContain('<rt>かん|じ</rt>');
      expect(result.html).not.toContain('<rt>かん</rt>');
    });

    test('should handle nested markdown structures with ruby', () => {
      const markdown = '**{漢字|かんじ}** and *{仮名|かな}*';
      const result = formatAnalysisResult(markdown);
      
      expect(result.html).toContain('<strong>');
      expect(result.html).toContain('<em>');
      expect(result.html).toContain('<rb>漢字</rb>');
      expect(result.html).toContain('<rb>仮名</rb>');
    });

    test('should handle whitespace around ruby tags', () => {
      const markdown = 'これは {漢字|かんじ} です';
      const result = formatAnalysisResult(markdown);
      
      expect(result.html).toContain('これは ');
      expect(result.html).toContain('<ruby>');
      expect(result.html).toContain(' です');
    });
  });

  describe('Real-world Use Cases', () => {
    test('preserves V2 usage-oriented vocabulary fields in saved detail and rendered ruby', () => {
      const markdown = `
### 原句
  - {新|あたら}しい{制度|せいど}が{企業|きぎょう}の{成長|せいちょう}を{後押|あとお}ししている。
  - 翻譯：新制度正在推動企業成長。

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
#### <單字>オンライン
  - 重音：3
  - 英文：online
  - 解釋：線上、透過網路進行。
  - 原句中的意思：在本句中表示制度透過網路支援企業。
  - 常見搭配／句型框架：オンラインで{支援|しえん}する；オンライン{相談|そうだん}。
  - 語感／語域：日常、商務、行政服務都常用。
  - 自然例句：{専門家|せんもんか}がオンラインで{企業|きぎょう}を{支援|しえん}する。（專家在線上支援企業。）
  - 造句模板：A がオンラインで B を{支援|しえん}する。
  - 回想題：「線上支援企業」可說成「オンラインで{企業|きぎょう}を＿＿する」。

### 文法分析
`;

      const result = formatAnalysisResult(markdown);
      const word = result.json.words.find((w) => w.term.includes('後押'));
      const loanword = result.json.words.find((w) => w.term === 'オンライン');

      expect(word).toBeDefined();
      expect(word.detail).toContain('原句中的意思：在本句中表示制度幫助企業成長往前推進。');
      expect(word.detail).toContain('常見搭配／句型框架：〜を{後押|あとお}しする');
      expect(word.detail).toContain('自然例句：{政府|せいふ}の{支援|しえん}');
      expect(word.detail).toContain('語感／語域：偏新聞、商務、正式書面語。');
      expect(word.detail).toContain('造句模板：A が B を{後押|あとお}しする。');
      expect(word.detail).toContain('回想題：「推動地方經濟成長」');
      expect(loanword).toBeDefined();
      expect(loanword.detail).toContain('英文：online');
      expect(loanword.detail).toContain('常見搭配／句型框架：オンラインで{支援|しえん}する');
      expect(loanword.detail).toContain('造句模板：A がオンラインで B を{支援|しえん}する。');
      expect(loanword.detail).not.toContain('辭書形');
      expect(loanword.detail).not.toContain('動詞分類');

      expect(result.html).toContain('<rb>後押</rb>');
      expect(result.html).toContain('<rt>あとお</rt>');
      expect(result.html).toContain('<rb>地域経済</rb>');
      expect(result.html).toContain('<rb>専門家</rb>');
      expect(result.html).toContain('造句模板');
      expect(result.html).toContain('回想題');
    });

    test('should handle typical Japanese learning content', () => {
      const markdown = `
### 原句：
この{結婚|けっこん}を{機|き}に{人|ひと}として、{役者|やくしゃ}としてもより{一層|いっそう}{成長|せいちょう}できるよう、{真摯|しんし}に{仕事|しごと}と{向|む}き{合|あ}っていく{所存|しょぞん}でございます

### 翻譯：
藉由這次結婚的機會，作為一個人，也作為一名演員，我將會更加努力地成長，並真誠地面對工作。

### 單字分析
#### <單字>{結婚|けっこん}する
  - 讀音：けっこんする
  - 重音：0
  - 動詞分類：サ變動詞
  - 意思：結婚
  - 辭書形：{結婚|けっこん}する
  - て形：{結婚|けっこん}して
  - 否定形：{結婚|けっこん}しない
#### <單字>{成長|せいちょう}する
  - 讀音：せいちょうする
  - 重音：0
  - 動詞分類：サ變動詞
  - 意思：成長、發展
  - 辭書形：{成長|せいちょう}する
  - て形：{成長|せいちょう}して
  - 否定形：{成長|せいちょう}しない
#### <單字>{向|む}き{合|あ}う
  - 讀音：むきあう
  - 重音：3
  - 動詞分類：五段動詞
  - 意思：面對、對峙
  - 辭書形：{向|む}き{合|あ}う
  - て形：{向|む}き{合|あ}って
  - 否定形：{向|む}き{合|あ}わない

### 文法分析

#### <文法>〜を{機|き}に（して）
- **JLPT** : N2
- **接續形式**
  - 名詞 + を{機|き}に（して）
- **用法說明**
  1. **表示契機或機會**
     - 這個句型表示以某個事件、機會或時間點為契機，開始做某事或發生某種變化。強調「抓住這個機會」或「因為這個機會而...」。
  2. **常用於積極的語境**
     - 通常用於表達積極的轉變、新的開始或決心。
  3. **與「〜を{きっかけ|きっかけ}に」的比較**
     - 「〜を{機|き}に」比「〜を{きっかけ|きっかけ}に」語氣更為正式，且更強調「把握住這個機會」的意圖。
- **例句**
  - {大学|だいがく}を{卒業|そつぎょう}したのを{機|き}に、{海外|かいがい}で{働|はたら}くことにした。（以大學畢業為契機，決定到海外工作。）
  - {病気|びょうき}を{経験|けいけん}したことを{機|き}に、{健康|けんこう}に{気|き}を{使|つか}うようになった。（以生病為契機，開始注意健康。）

#### <文法>〜{所存|しょぞん}でございます
- **JLPT** : N1
- **接續形式**
  - 動詞辭書形 + {所存|しょぞん}でございます
  - 名詞 + の + {所存|しょぞん}でございます (較少見，多用於表達「是...的意圖」)
- **用法說明**
  1. **表達意圖或決心（謙讓語）**
     - 「{所存|しょぞん}」是「{思|おも}い」或「{考|かんが}え」的謙讓語，表示「我打算...」、「我認為...」。
  2. **極其鄭重且謙遜的表達**
     - 加上「でございます」使其成為極其鄭重且謙遜的表達方式，常用於正式場合、書信、公開聲明或商業溝通中，表達自己的意圖或決心。
  3. **適用於上級或公眾**
     - 主要用於對上級、客戶或廣大公眾表達自己的計劃、承諾或態度。
- **例句**
  - {今後|こんご}とも{精一杯|せいいっぱい}{努力|どりょく}していく{所存|しょぞん}でございます。（今後我也將竭盡全力努力。）
  - {皆様|みなさま}のご{期待|きたい}に{沿|そ}えるよう、{誠心誠意|せいしんせいい}{務|つと}める{所存|しょぞん}でございます。（為了不辜負大家的期待，我將誠心誠意地努力。）

      `;
      
      const result = formatAnalysisResult(markdown);
      
      // Check for proper HTML structure
      expect(result.html).toContain('<h3>');
      expect(result.html).toContain('<h4>');
      expect(result.html).toContain('<p>');
      expect(result.html).toContain('<ul>');
      expect(result.html).toContain('<li>');
      
      // Check for ruby tags throughout - use actual ruby tags that are in the markdown
      expect(result.html).toContain('<rb>結婚</rb>');
      expect(result.html).toContain('<rt>けっこん</rt>');
      expect(result.html).toContain('<rb>成長</rb>');
      expect(result.html).toContain('<rt>せいちょう</rt>');
    });

  });
});
