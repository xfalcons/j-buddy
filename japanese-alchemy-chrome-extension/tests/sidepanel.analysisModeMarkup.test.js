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

  test('renders AI choices as a segmented button group instead of a dropdown', () => {
    expect(html).toContain('class="ai-selection-toggle"');
    expect(html).toContain('data-ai-preference="gemini"');
    expect(html).toContain('data-ai-preference="zai"');
    expect(html).not.toContain('<select id="aiPreference"');
    expect(html.indexOf('data-ai-preference="zai"')).toBeLessThan(
      html.indexOf('data-ai-preference="gemini"')
    );
  });

  test('keeps the top controls in one horizontal row', () => {
    expect(html).toMatch(/\.controls\s*\{[\s\S]*?flex-wrap:\s*nowrap;/);
    expect(html).toMatch(/\.controls-left\s*\{[\s\S]*?flex-wrap:\s*nowrap;/);
  });
});
