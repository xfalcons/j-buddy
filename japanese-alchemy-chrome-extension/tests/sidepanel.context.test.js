/**
 * Unit tests for the surrounding-context cache key used by the sidepanel result
 * cache. Pure helper only — does not import sidepanel.js.
 */
import { buildContextCacheKey } from '../src/scripts/surroundingContext.js';

describe('buildContextCacheKey', () => {
  test('equal for identical selection + context', () => {
    const a = buildContextCacheKey({ selectedText: 'テスト', context: { before: '前', after: '後' } });
    const b = buildContextCacheKey({ selectedText: 'テスト', context: { before: '前', after: '後' } });
    expect(a).toBe(b);
    // Context present → key is not just the bare text.
    expect(a).not.toBe('テスト');
  });

  test('differs when before changes', () => {
    const a = buildContextCacheKey({ selectedText: 'テスト', context: { before: '前1', after: '後' } });
    const b = buildContextCacheKey({ selectedText: 'テスト', context: { before: '前2', after: '後' } });
    expect(a).not.toBe(b);
  });

  test('differs when after changes', () => {
    const a = buildContextCacheKey({ selectedText: 'テスト', context: { before: '前', after: '後1' } });
    const b = buildContextCacheKey({ selectedText: 'テスト', context: { before: '前', after: '後2' } });
    expect(a).not.toBe(b);
  });

  test('differs when selectedText changes', () => {
    const a = buildContextCacheKey({ selectedText: 'テスト', context: { before: '前', after: '後' } });
    const b = buildContextCacheKey({ selectedText: '別の文', context: { before: '前', after: '後' } });
    expect(a).not.toBe(b);
  });

  test('empty/absent context reduces to the bare selectedText (no-context cache behaves as today)', () => {
    expect(buildContextCacheKey({ selectedText: 'テスト', context: { before: '', after: '' } })).toBe('テスト');
    expect(buildContextCacheKey({ selectedText: 'テスト', context: {} })).toBe('テスト');
    expect(buildContextCacheKey({ selectedText: 'テスト' })).toBe('テスト');
    // Same selection with vs without context must NOT collide.
    expect(
      buildContextCacheKey({ selectedText: 'テスト', context: { before: '', after: '' } })
    ).not.toBe(
      buildContextCacheKey({ selectedText: 'テスト', context: { before: '前', after: '後' } })
    );
  });

  test('unambiguous — different before/after splits cannot collide', () => {
    // 'ab'|'' vs 'a'|'b' must produce different keys.
    const a = buildContextCacheKey({ selectedText: 'x', context: { before: 'ab', after: '' } });
    const b = buildContextCacheKey({ selectedText: 'x', context: { before: 'a', after: 'b' } });
    expect(a).not.toBe(b);
  });
});
