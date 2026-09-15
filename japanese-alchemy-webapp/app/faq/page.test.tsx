import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import FaqPage from './page';

describe('FAQ page', () => {
  it('renders numbered questions with Gemini guidance selected by default', () => {
    const html = renderToStaticMarkup(<FaqPage />);

    expect(html).toContain('常見問題');
    expect(html).toContain('1. 點擊「開始分析」後出現「呼叫分析服務時發生錯誤：Gemini API error: Too Many Requests」怎麼辦？');
    expect(html).toContain('Gemini API error: Too Many Requests');
    expect(html).toContain('Google Gemini 免費方案的 API 用量已達限制');
    expect(html).toContain('什麼是 LLM API 提供者「代管」？');
    expect(html).toContain('什麼是 LLM API 提供者「個人」？');
    expect(html).toContain('>2</span>');
    expect(html).toContain('>3</span>');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).not.toContain('<details');
  });

  it('renders the public page without credential inputs', () => {
    const html = renderToStaticMarkup(<FaqPage />);

    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('API Key');
  });
});
