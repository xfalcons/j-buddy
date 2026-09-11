import fs from 'fs';
import path from 'path';
import {
  CONTEXT_AFTER_LABEL,
  CONTEXT_BEFORE_LABEL,
  MAX_CONTEXT_CHARS,
  SYSTEM_PROMPT_V1,
  SYSTEM_PROMPT_V2,
  TARGET_LABEL,
  buildDirectAnalysisMessage,
  buildDirectCompletionRequest,
  getSystemPrompt,
} from '../src/scripts/directAnalysisContract.js';

function backendModelSource(filename) {
  return fs.readFileSync(path.resolve(__dirname, '../../japanese-alchemy-hosting/functions/src/models', filename), 'utf8');
}

function backendPrompt(filename, declaration) {
  const match = backendModelSource(filename).match(
    new RegExp(`^${declaration} = \`([\\s\\S]*?)\`;$`, 'm')
  );
  expect(match).toHaveLength(2);
  return match[1];
}

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
      reasoning_effort: 'low',
      stream: true,
    }));
    expect(request.messages).toEqual([
      { role: 'system', content: getSystemPrompt('v1') },
      { role: 'user', content: '【前文】前文\n【分析対象】日本語\n【後文】後文' },
    ]);
    expect(getSystemPrompt('v1')).toContain('1〜3 個 N1, N2, N3 文法點');
    expect(getSystemPrompt('v2')).toContain('最多 4 個高價值詞');
  });

  test('matches the current backend prompts byte-for-byte', () => {
    expect(SYSTEM_PROMPT_V1).toBe(
      backendPrompt('systemPromptV1.ts', 'export const SYSTEM_PROMPT_V1')
    );
    expect(SYSTEM_PROMPT_V2).toBe(
      backendPrompt('systemPromptV2.ts', 'export const SYSTEM_PROMPT_V2')
    );
  });

  test('matches the current backend context-message contract constants', () => {
    const source = backendModelSource('analysisMessage.ts');
    expect(source).toContain(`export const CONTEXT_BEFORE_LABEL = "${CONTEXT_BEFORE_LABEL}";`);
    expect(source).toContain(`export const TARGET_LABEL = "${TARGET_LABEL}";`);
    expect(source).toContain(`export const CONTEXT_AFTER_LABEL = "${CONTEXT_AFTER_LABEL}";`);
    expect(source).toContain(`export const MAX_CONTEXT_CHARS = ${MAX_CONTEXT_CHARS};`);
  });
});
