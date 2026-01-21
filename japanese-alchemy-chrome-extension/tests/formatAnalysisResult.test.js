/**
 * Unit tests for formatAnalysisResult function
 * This file tests the formatting of markdown to HTML with ruby tag support
 */

// Import functions being tested from source file
import { formatAnalysisResult, convertToRuby } from '../src/sidepanel/sidepanel.js';

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
