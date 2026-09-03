import fs from 'fs';
import path from 'path';

describe('sidepanel analysis-mode markup', () => {
  const html = fs.readFileSync(
    path.join(process.cwd(), 'src/sidepanel/sidepanel.html'),
    'utf8'
  );

  test('renders learner-facing analysis mode labels in the top controls', () => {
    expect(html).toContain('class="analysis-mode-toggle"');
    expect(html).toContain('role="group"');
    expect(html).toContain('精簡分析');
    expect(html).toContain('造句分析');
  });

  test('does not expose raw prompt versions as visible button labels', () => {
    expect(html).not.toContain('>v1<');
    expect(html).not.toContain('>v2<');
  });

  test('defaults the visible selected state to sentence-production analysis', () => {
    expect(html).toContain(
      '<button class="analysis-mode-option selected" type="button" data-prompt-variant="v2"'
    );
    expect(html).toContain('aria-pressed="true">造句分析</button>');
  });

  test('does not expose custom provider settings', () => {
    expect(html).not.toContain('personalProvider');
    expect(html).not.toContain('LLM API 提供者');
    expect(html).not.toContain('data-provider-mode');
    expect(html).not.toContain('API 金鑰');
    expect(html).toContain('登入即可私密儲存項目；不登入也可儲存至共享收藏。');
    expect(html).not.toContain('data-ai-preference');
    expect(html).not.toContain('aiPreference');
  });

  test('keeps the top controls in one horizontal row', () => {
    expect(html).toMatch(/\.controls\s*\{[\s\S]*?flex-wrap:\s*nowrap;/);
    expect(html).toMatch(/\.controls-left\s*\{[\s\S]*?flex-wrap:\s*nowrap;/);
  });

  test('provides an initially hidden Stop analysis control in the loading state', () => {
    expect(html).toContain('id="cancelAnalysisButton"');
    expect(html).toContain('hidden>停止分析</button>');
    expect(html).toContain('aria-label="停止目前分析"');
  });
});
