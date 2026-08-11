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

  test('renders separate provider settings without repurposing prompt variants', () => {
    expect(html).toContain('id="personalProviderSettings"');
    expect(html).toContain('<span>LLM API 提供者</span>');
    expect(html).toContain('aria-label="LLM API 提供者"');
    expect(html).toContain('id="personalProviderSummary" class="provider-summary">代管</span>');
    expect(html).toContain('class="provider-mode-toggle"');
    expect(html).toContain('data-provider-mode="managed"');
    expect(html).toContain('data-provider-mode="personal"');
    expect(html).toContain('id="personalProviderApiUrl"');
    expect(html).toContain('id="personalProviderApiKey"');
    expect(html).toContain('id="personalProviderModel"');
    expect(html).toContain('<form id="personalProviderForm" novalidate hidden>');
    expect(html).toContain('儲存');
    expect(html).toContain('清除');
    expect(html).toContain('登入即可私密儲存項目；不登入也可儲存至共享收藏。');
    expect(html).toContain('API 金鑰 — 金鑰僅儲存在本機並於本機使用，不會經過代理或伺服器。');
    expect(html).not.toContain('data-ai-preference');
    expect(html).not.toContain('aiPreference');
  });

  test('exposes personal-provider status accessibly', () => {
    expect(html).toContain('id="personalProviderStatus"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('id="personalProviderError"');
    expect(html).toContain('role="alert"');
  });

  test('keeps the top controls in one horizontal row', () => {
    expect(html).toMatch(/\.controls\s*\{[\s\S]*?flex-wrap:\s*nowrap;/);
    expect(html).toMatch(/\.controls-left\s*\{[\s\S]*?flex-wrap:\s*nowrap;/);
  });
});
