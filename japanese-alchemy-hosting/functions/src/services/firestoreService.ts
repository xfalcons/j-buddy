import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { VocabularyItem, GrammarItem, AnalysisPageItem } from "../models/types";

export class FirestoreService {
  private db: admin.firestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  async saveVocabulary(
    userId: string | null, 
    words: Array<{ term: string; [key: string]: any }>,
    isShared: boolean = false,
    metadata: any = {}
  ): Promise<number> {
    if (!words || words.length === 0) {
      return 0;
    }

    const batch = this.db.batch();
    // Determine collection path based on shared flag
    const vocabulariesRef = isShared 
      ? this.db.collection('shared_vocabularies')
      : this.db.collection(`users/${userId}/vocabularies`);
    const timestamp = Date.now();

    words.forEach((word) => {
      const docRef = vocabulariesRef.doc();
      const vocabularyItem: VocabularyItem = {
        term: word.term,
        detail: JSON.stringify(word),
        createdAt: timestamp,
      };
      // Add metadata if saving to shared collection
      if (isShared && Object.keys(metadata).length > 0) {
        (vocabularyItem as any).metadata = metadata;
      }
      batch.set(docRef, vocabularyItem);
    });

    await batch.commit();
    const logMessage = isShared 
      ? `Saved ${words.length} vocabulary items to shared collection`
      : `Saved ${words.length} vocabulary items for user ${userId}`;
    functions.logger.info(logMessage);
    return words.length;
  }

  async saveGrammar(
    userId: string | null, 
    grammars: Array<{ point: string; [key: string]: any }>,
    isShared: boolean = false,
    metadata: any = {}
  ): Promise<number> {
    if (!grammars || grammars.length === 0) {
      return 0;
    }

    const batch = this.db.batch();
    // Determine collection path based on shared flag
    const grammarsRef = isShared 
      ? this.db.collection('shared_grammars')
      : this.db.collection(`users/${userId}/grammars`);
    const timestamp = Date.now();

    grammars.forEach((grammar) => {
      const docRef = grammarsRef.doc();
      const grammarItem: GrammarItem = {
        point: grammar.point,
        explanation: JSON.stringify(grammar),
        createdAt: timestamp,
      };
      // Add metadata if saving to shared collection
      if (isShared && Object.keys(metadata).length > 0) {
        (grammarItem as any).metadata = metadata;
      }
      batch.set(docRef, grammarItem);
    });

    await batch.commit();
    const logMessage = isShared 
      ? `Saved ${grammars.length} grammar items to shared collection`
      : `Saved ${grammars.length} grammar items for user ${userId}`;
    functions.logger.info(logMessage);
    return grammars.length;
  }

  async getUserVocabularies(userId: string, limit?: number): Promise<VocabularyItem[]> {
    const query = this.db
      .collection(`users/${userId}/vocabularies`)
      .orderBy("createdAt", "desc")
      .limit(limit || 50);

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as VocabularyItem[];
  }

  async getUserGrammars(userId: string, limit?: number): Promise<GrammarItem[]> {
    const query = this.db
      .collection(`users/${userId}/grammars`)
      .orderBy("createdAt", "desc")
      .limit(limit || 50);

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as GrammarItem[];
  }

  async saveAnalysisPage(
    userId: string | null,
    page: { rendered_markdown: string },
    isShared: boolean = false,
    metadata: any = {}
  ): Promise<boolean> {
    if (!page || !page.rendered_markdown) {
      return false;
    }

    const pagesRef = isShared
      ? this.db.collection('shared_analysis_pages')
      : this.db.collection(`users/${userId}/analysis_pages`);
    const timestamp = Date.now();

    const pageItem: AnalysisPageItem = {
      rendered_markdown: page.rendered_markdown,
      source_text: metadata.source_text || '',
      source_url: metadata.source_url || '',
      saved_at: metadata.saved_at || new Date().toISOString(),
      createdAt: timestamp,
    };

    await pagesRef.add(pageItem);
    const logMessage = isShared
      ? `Saved analysis page to shared collection`
      : `Saved analysis page for user ${userId}`;
    functions.logger.info(logMessage);
    return true;
  }
}
