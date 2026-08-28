import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  Timestamp: class Timestamp {},
}));

vi.mock('firebase/firestore', () => firestore);
vi.mock('@/lib/firebase', () => ({ db: { name: 'db' } }));

import {
  deleteAnalysisPage,
  getSharedAnalysisPages,
  getSharedVocabularies,
  getSharedGrammars,
} from './firestoreService';

describe('analysis page Firestore operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.doc.mockImplementation((...segments: unknown[]) => ({
      path: segments.slice(1).join('/'),
    }));
    firestore.collection.mockImplementation((...segments: unknown[]) => ({ segments }));
    firestore.query.mockImplementation((...parts: unknown[]) => ({ parts }));
    firestore.orderBy.mockReturnValue({ order: 'createdAt' });
  });

  it('deletes only the selected page document from its owner collection', async () => {
    await deleteAnalysisPage('viewer', 'page-1');

    expect(firestore.deleteDoc).toHaveBeenCalledWith({
      path: 'users/viewer/analysis_pages/page-1',
    });
  });

  it('loads shared pages in newest-first order', async () => {
    firestore.getDocs.mockResolvedValue({ docs: [{ id: 'shared-1', data: () => ({
      rendered_markdown: '# Shared',
      source_text: '共有',
      source_url: '',
      saved_at: '2026-08-20T00:00:00.000Z',
      createdAt: new Date('2026-08-20T00:00:00.000Z'),
    }) }] });

    await expect(getSharedAnalysisPages()).resolves.toEqual([
      expect.objectContaining({ id: 'shared-1', rendered_markdown: '# Shared' }),
    ]);
    expect(firestore.collection).toHaveBeenCalledWith({ name: 'db' }, 'shared_analysis_pages');
    expect(firestore.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
  });

  it('converts numeric Firestore timestamps to dates', async () => {
    const createdAt = Date.parse('2026-08-20T00:00:00.000Z');
    firestore.getDocs.mockResolvedValue({ docs: [{ id: 'shared-1', data: () => ({
      rendered_markdown: '# Shared',
      source_text: '共有',
      source_url: '',
      saved_at: '2026-08-20T00:00:00.000Z',
      createdAt,
    }) }] });

    await expect(getSharedAnalysisPages()).resolves.toEqual([
      expect.objectContaining({ createdAt: new Date(createdAt) }),
    ]);
  });
});

describe('shared vocabulary operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.collection.mockImplementation((...segments: unknown[]) => ({ segments }));
    firestore.query.mockImplementation((...parts: unknown[]) => ({ parts }));
    firestore.orderBy.mockReturnValue({ order: 'createdAt' });
  });

  it('loads shared vocabularies in newest-first order', async () => {
    firestore.getDocs.mockResolvedValue({ docs: [{ id: 'sv-1', data: () => ({
      term: '日本語',
      detail: '{"term":"日本語","reading":"にほんご"}',
      createdAt: Date.parse('2026-08-20T00:00:00.000Z'),
      metadata: { source_text: '日本語を学ぶ', source_url: 'https://example.com' },
    }) }] });

    const result = await getSharedVocabularies();

    expect(firestore.collection).toHaveBeenCalledWith({ name: 'db' }, 'shared_vocabularies');
    expect(firestore.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(result).toEqual([
      expect.objectContaining({
        id: 'sv-1',
        term: '日本語',
        isShared: true,
        metadata: { source_text: '日本語を学ぶ', source_url: 'https://example.com' },
      }),
    ]);
  });

  it('handles shared vocabulary items without metadata', async () => {
    firestore.getDocs.mockResolvedValue({ docs: [{ id: 'sv-2', data: () => ({
      term: '勉強',
      detail: '{"term":"勉強"}',
      createdAt: Date.parse('2026-08-20T00:00:00.000Z'),
    }) }] });

    const result = await getSharedVocabularies();

    expect(result).toEqual([
      expect.objectContaining({ id: 'sv-2', term: '勉強', isShared: true }),
    ]);
    expect(result[0].metadata).toBeUndefined();
  });
});

describe('shared grammar operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.collection.mockImplementation((...segments: unknown[]) => ({ segments }));
    firestore.query.mockImplementation((...parts: unknown[]) => ({ parts }));
    firestore.orderBy.mockReturnValue({ order: 'createdAt' });
  });

  it('loads shared grammars in newest-first order', async () => {
    firestore.getDocs.mockResolvedValue({ docs: [{ id: 'sg-1', data: () => ({
      point: '〜です',
      explanation: '{"point":"〜です","meaning":"copula"}',
      createdAt: Date.parse('2026-08-20T00:00:00.000Z'),
      metadata: { source_text: '私は学生です' },
    }) }] });

    const result = await getSharedGrammars();

    expect(firestore.collection).toHaveBeenCalledWith({ name: 'db' }, 'shared_grammars');
    expect(firestore.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(result).toEqual([
      expect.objectContaining({
        id: 'sg-1',
        point: '〜です',
        isShared: true,
        metadata: { source_text: '私は学生です' },
      }),
    ]);
  });
});
