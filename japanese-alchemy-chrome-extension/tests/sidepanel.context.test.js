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

  test('empty/absent context reduces to the version + bare selectedText', () => {
    // The version prefix (bumped when the conjugation engine shipped) is what
    // distinguishes a post-engine key from a pre-engine cached one.
    expect(buildContextCacheKey({ selectedText: 'テスト', context: { before: '', after: '' } })).toBe('cgv1テスト');
    expect(buildContextCacheKey({ selectedText: 'テスト', context: {} })).toBe('cgv1テスト');
    expect(buildContextCacheKey({ selectedText: 'テスト' })).toBe('cgv1テスト');
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

  test('a context-path key carries a NUL sentinel a real selectedText cannot contain', () => {
    // A context key begins with the version prefix, then a NUL sentinel; real
    // page selections (trimmed, no control bytes) can never contain the NUL, so
    // a no-context selection cannot collide with a context key and serve a
    // stale analysis.
    const withCtx = buildContextCacheKey({
      selectedText: '猫',
      context: { before: 'hello', after: 'world' },
    });
    expect(withCtx.startsWith('cgv1')).toBe(true);
    expect(withCtx.charCodeAt('cgv1'.length)).toBe(0); // NUL sentinel right after the version prefix
    // A selectedText that literally resembles the serialized form still reduces
    // to the version + itself (no NUL) and does not equal the context key.
    const lookalike = '猫 5|hello5|world';
    expect(buildContextCacheKey({ selectedText: lookalike })).toBe('cgv1' + lookalike);
    expect(buildContextCacheKey({ selectedText: lookalike })).not.toBe(withCtx);
  });

  test('version segment invalidates keys written before the conjugation engine (U4)', () => {
    // A pre-engine cached key had no version prefix: the no-context form was
    // the bare selectedText, and the context form began with a bare NUL. Neither
    // can match the post-engine key for the same input, so upgraded clients
    // never serve a stale pre-engine response.
    const noCtxNew = buildContextCacheKey({ selectedText: 'テスト' });
    expect(noCtxNew).not.toBe('テスト');
    expect(noCtxNew.startsWith('cgv1')).toBe(true);

    const withCtxNew = buildContextCacheKey({
      selectedText: '猫',
      context: { before: 'hello', after: 'world' },
    });
    expect(withCtxNew.charCodeAt(0)).not.toBe(0); // old context form began with NUL
    expect(withCtxNew.startsWith('cgv1')).toBe(true);
  });

  test('prompt variant separates cached results for the same selection and context', () => {
    const compact = buildContextCacheKey({
      selectedText: '成長を後押しする',
      promptVariant: 'v1',
      context: { before: '制度が', after: 'という。' },
    });
    const usage = buildContextCacheKey({
      selectedText: '成長を後押しする',
      promptVariant: 'v2',
      context: { before: '制度が', after: 'という。' },
    });

    expect(compact).not.toBe(usage);
    expect(compact).toContain('v1');
    expect(usage).toContain('v2');
  });

  test('prompt variant preserves the old no-variant cache key when omitted', () => {
    expect(buildContextCacheKey({ selectedText: 'テスト', promptVariant: 'v2' })).not.toBe(
      buildContextCacheKey({ selectedText: 'テスト' })
    );
    expect(buildContextCacheKey({ selectedText: 'テスト' })).toBe('cgv1テスト');
  });
});
