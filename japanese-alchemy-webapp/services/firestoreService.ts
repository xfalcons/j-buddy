import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Vocabulary, Grammar, AnalysisPage } from '@/types';

// Subcollection names
const VOCABULARIES_SUBCOLLECTION = 'vocabularies';
const GRAMMARS_SUBCOLLECTION = 'grammars';
const ANALYSIS_PAGES_SUBCOLLECTION = 'analysis_pages';

// Convert Firestore timestamp to Date
const timestampToDate = (timestamp: Timestamp | Date | number): Date => {
  if (timestamp instanceof Timestamp) return timestamp.toDate();
  return new Date(timestamp);
};

export async function getUserVocabularies(userId: string): Promise<Vocabulary[]> {
  const userDocRef = doc(db, 'users', userId);
  const q = query(
    collection(userDocRef, VOCABULARIES_SUBCOLLECTION),
    orderBy('createdAt', 'desc')
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: timestampToDate(d.data().createdAt as Timestamp),
  })) as Vocabulary[];
}

export async function getUserGrammars(userId: string): Promise<Grammar[]> {
  const userDocRef = doc(db, 'users', userId);
  const q = query(
    collection(userDocRef, GRAMMARS_SUBCOLLECTION),
    orderBy('createdAt', 'desc')
  );
 
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: timestampToDate(d.data().createdAt as Timestamp),
  })) as Grammar[];
}

export async function getUserAnalysisPages(userId: string): Promise<AnalysisPage[]> {
  const userDocRef = doc(db, 'users', userId);
  const q = query(
    collection(userDocRef, ANALYSIS_PAGES_SUBCOLLECTION),
    orderBy('createdAt', 'desc')
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: timestampToDate(d.data().createdAt as Timestamp),
  })) as AnalysisPage[];
}

export async function deleteAnalysisPage(userId: string, pageId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, ANALYSIS_PAGES_SUBCOLLECTION, pageId));
}

export async function getSharedAnalysisPages(): Promise<AnalysisPage[]> {
  const q = query(
    collection(db, 'shared_analysis_pages'),
    orderBy('createdAt', 'desc')
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((pageDoc) => {
    const data = pageDoc.data();
    return {
      id: pageDoc.id,
      ...data,
      createdAt: timestampToDate(data.createdAt as Timestamp),
    };
  }) as AnalysisPage[];
}

export async function getSharedVocabularies(): Promise<Vocabulary[]> {
  const q = query(
    collection(db, 'shared_vocabularies'),
    orderBy('createdAt', 'desc')
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((vocabDoc) => {
    const data = vocabDoc.data();
    return {
      id: vocabDoc.id,
      ...data,
      isShared: true,
      createdAt: timestampToDate(data.createdAt as Timestamp),
    };
  }) as Vocabulary[];
}

export async function getSharedGrammars(): Promise<Grammar[]> {
  const q = query(
    collection(db, 'shared_grammars'),
    orderBy('createdAt', 'desc')
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((grammarDoc) => {
    const data = grammarDoc.data();
    return {
      id: grammarDoc.id,
      ...data,
      isShared: true,
      createdAt: timestampToDate(data.createdAt as Timestamp),
    };
  }) as Grammar[];
}
