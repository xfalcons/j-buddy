import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import FaqPage from './page';

describe('FAQ page', () => {
  it('renders public Traditional Chinese Gemini quota guidance expanded by default', () => {
    const html = renderToStaticMarkup(<FaqPage />);

    expect(html).toContain('常見問題');
    expect(html).toContain('Gemini API error: Too Many Requests');
    expect(html).toContain('Google Gemini 免費方案的 API 用量已達限制');
    expect(html).toMatch(/<details open=""[^>]*>/);
  });
});
