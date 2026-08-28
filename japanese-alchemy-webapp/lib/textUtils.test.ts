/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  markdownToHtml,
  parseFurigana,
  renderGrammarExplanation,
  renderVocabularyDetail,
} from './textUtils';

describe('saved analysis HTML rendering', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const maliciousMarkdown = `
<script>window.__xss = true</script>
<img src=x onerror="window.__xss = true">
<a href="javascript:window.__xss = true" onclick="window.__xss = true">unsafe link</a>
{日本語|にほんご}`;

  it('sanitizes rendered markdown while preserving ruby annotations', () => {
    const html = markdownToHtml(parseFurigana(maliciousMarkdown));

    expect(html).not.toMatch(/<\/?script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toContain('onerror=');
    expect(html).not.toContain('onclick=');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<ruby><rb>日本語</rb><rt>にほんご</rt></ruby>');
  });

  it('sanitizes every saved vocabulary and grammar display value', () => {
    const termHtml = parseFurigana(`<svg onload="window.__xss = true"></svg>{単語|たんご}`);
    const pointHtml = parseFurigana(`<iframe src="https://attacker.invalid"></iframe>{文法|ぶんぽう}`);
    const vocabularyHtml = renderVocabularyDetail(maliciousMarkdown);
    const grammarHtml = renderGrammarExplanation(maliciousMarkdown);

    for (const html of [termHtml, pointHtml, vocabularyHtml, grammarHtml]) {
      expect(html).not.toMatch(/<(?:iframe|img|script|svg)/i);
      expect(html).not.toMatch(/\son\w+=/i);
      expect(html).not.toContain('javascript:');
    }
    expect(termHtml).toContain('<ruby><rb>単語</rb><rt>たんご</rt></ruby>');
    expect(pointHtml).toContain('<ruby><rb>文法</rb><rt>ぶんぽう</rt></ruby>');
  });

  it('renders saved Markdown values without JSON parse errors', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const vocabularyMarkdown = '- 讀音：にほんご';
    const grammarMarkdown = '- 接続形式：名詞 + として';

    const vocabularyHtml = renderVocabularyDetail(vocabularyMarkdown);
    const grammarHtml = renderGrammarExplanation(grammarMarkdown);

    expect(vocabularyHtml).toContain('讀音：にほんご');
    expect(grammarHtml).toContain('接続形式：名詞 + として');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('unwraps legacy JSON-encoded vocabulary and grammar values', () => {
    const vocabularyHtml = renderVocabularyDetail(
      JSON.stringify({ term: '日本語', detail: '- 讀音：にほんご' })
    );
    const grammarHtml = renderGrammarExplanation(
      JSON.stringify({ point: '〜として', explanation: '- 接続形式：名詞 + として' })
    );

    expect(vocabularyHtml).toContain('讀音：にほんご');
    expect(vocabularyHtml).not.toContain('"term"');
    expect(grammarHtml).toContain('接続形式：名詞 + として');
    expect(grammarHtml).not.toContain('"point"');
  });
});
