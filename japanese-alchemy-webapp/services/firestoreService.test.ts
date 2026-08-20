import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  addDoc: vi.fn(),
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
  importGrammar,
  importVocabulary,
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

  it('imports vocabulary and grammar as new documents in the viewer collections', async () => {
    firestore.addDoc
      .mockResolvedValueOnce({ id: 'vocab-import' })
      .mockResolvedValueOnce({ id: 'grammar-import' });

    const vocabulary = await importVocabulary('viewer', { term: '日本語', detail: 'Japanese' });
    const grammar = await importGrammar('viewer', { point: '〜です', explanation: 'Copula' });

    expect(firestore.addDoc).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ segments: [{ path: 'users/viewer' }, 'vocabularies'] }),
      expect.objectContaining({ term: '日本語', detail: 'Japanese', createdAt: expect.any(Date) }),
    );
    expect(firestore.addDoc).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ segments: [{ path: 'users/viewer' }, 'grammars'] }),
      expect.objectContaining({ point: '〜です', explanation: 'Copula', createdAt: expect.any(Date) }),
    );
    expect(vocabulary).toEqual(expect.objectContaining({ id: 'vocab-import', term: '日本語' }));
    expect(grammar).toEqual(expect.objectContaining({ id: 'grammar-import', point: '〜です' }));
  });
});
