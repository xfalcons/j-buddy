/**
 * Unit tests for the explain request-body builder. Pure helper only — does not
 * import the firebase-backed jaAlchemyApiService module.
 */
import { buildRequestBody } from '../src/scripts/requestBody.js';

describe('buildRequestBody', () => {
  test('no context → { content, prompt } with no context keys (backward compatible)', () => {
    expect(buildRequestBody('テスト', 'v2')).toEqual({ content: 'テスト', prompt: 'v2' });
    expect(buildRequestBody('テスト', 'v2', {})).toEqual({ content: 'テスト', prompt: 'v2' });
    expect(buildRequestBody('テスト', 'v2', { before: '', after: '' })).toEqual({
      content: 'テスト',
      prompt: 'v2',
    });
  });

  test('both sides present → includes context_before and context_after', () => {
    expect(buildRequestBody('テスト', 'v2', { before: '前', after: '後' })).toEqual({
      content: 'テスト',
      prompt: 'v2',
      context_before: '前',
      context_after: '後',
    });
  });

  test('only before non-empty → includes context_before, omits context_after', () => {
    expect(buildRequestBody('テスト', 'v2', { before: '前', after: '' })).toEqual({
      content: 'テスト',
      prompt: 'v2',
      context_before: '前',
    });
  });

  test('only after non-empty → includes context_after, omits context_before', () => {
    expect(buildRequestBody('テスト', 'v2', { before: '', after: '後' })).toEqual({
      content: 'テスト',
      prompt: 'v2',
      context_after: '後',
    });
  });

  test('prompt defaults to v2 when falsy', () => {
    expect(buildRequestBody('テスト', undefined, { before: '前', after: '後' })).toEqual({
      content: 'テスト',
      prompt: 'v2',
      context_before: '前',
      context_after: '後',
    });
    expect(buildRequestBody('テスト', null)).toEqual({ content: 'テスト', prompt: 'v2' });
  });

  test('preserves v1 when explicitly passed', () => {
    expect(buildRequestBody('テスト', 'v1')).toEqual({ content: 'テスト', prompt: 'v1' });
  });
});
