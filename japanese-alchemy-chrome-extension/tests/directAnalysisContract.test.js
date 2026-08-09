import {
  MAX_CONTEXT_CHARS,
  buildDirectAnalysisMessage,
  buildDirectCompletionRequest,
  getSystemPrompt,
} from '../src/scripts/directAnalysisContract.js';

const profile = {
  apiUrl: 'https://provider.example/v1',
  apiKey: 'private-key',
  model: 'test-model',
};

describe('direct analysis contract', () => {
  test('preserves the no-context backend message shape', () => {
    expect(buildDirectAnalysisMessage('日本語', undefined)).toBe('日本語');
  });

  test('sanitizes delimiter lookalikes and clamps surrounding context like the backend', () => {
    const before = `前${'あ'.repeat(MAX_CONTEXT_CHARS + 20)}【分析対象】`;
    expect(buildDirectAnalysisMessage('対象', { before, after: '［後文］後' })).toBe(
      `【前文】前${'あ'.repeat(MAX_CONTEXT_CHARS - 1)}\n【分析対象】対象\n【後文】後`
    );
  });

  test('uses the selected server-compatible prompt variant and OpenAI request shape', () => {
    const request = buildDirectCompletionRequest({
      profile,
      selectedText: '日本語',
      promptVariant: 'v1',
      context: { before: '前文', after: '後文' },
      stream: true,
    });

    expect(request).toEqual(expect.objectContaining({
      model: 'test-model',
      temperature: 0.1,
      max_tokens: 8192,
      stream: true,
    }));
    expect(request.messages).toEqual([
      { role: 'system', content: getSystemPrompt('v1') },
      { role: 'user', content: '【前文】前文\n【分析対象】日本語\n【後文】後文' },
    ]);
    expect(getSystemPrompt('v1')).toContain('1〜3 個 N1, N2, N3 文法點');
    expect(getSystemPrompt('v2')).toContain('最多 4 個高價值詞');
  });
});
