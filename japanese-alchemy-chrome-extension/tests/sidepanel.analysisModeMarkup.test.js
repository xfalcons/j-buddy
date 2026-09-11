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

  test('exposes disclosed custom provider settings without displacing current controls', () => {
    expect(html).toContain('id="personalProviderSettings"');
    expect(html).toContain('LLM API 提供者');
    expect(html).toContain('data-provider-mode="personal"');
    expect(html).toContain('API 金鑰');
    expect(html).toContain('模型探索只會把 API 金鑰直接傳送至你選擇的提供者');
    expect(html).toContain('個人分析會把 API 金鑰、選取文字與前後文直接傳送至該提供者');
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

  test('separates the manual analysis action from the analysis result', () => {
    expect(html).toMatch(/#analyzeButton\s*\{[\s\S]*?margin-bottom:\s*8px;/);
  });

  test('provides a session-scoped allowance status and explicit alternative-provider action', () => {
    expect(html).toContain('id="allowanceStatus"');
    expect(html).toContain('hidden></div>');
    expect(html).toContain('id="allowanceAction"');
    expect(html).toContain('hidden>了解個人提供器選項</button>');
    expect(html).toMatch(/\[hidden\]\s*\{\s*display\s*:\s*none\s*!important;/);
    expect(html).not.toMatch(/#allowanceAction\s*\{[^}]*display\s*:/);
  });
});
