import {
  collection,
  getDocs,
  addDoc,
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
const timestampToDate = (timestamp: Timestamp | Date): Date => {
  return timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
};

export async function getUserVocabularies(userId: string): Promise<Vocabulary[]> {
  // log userId for debugging
  const userDocRef = doc(db, 'users', userId);
  const q = query(
    collection(userDocRef, VOCABULARIES_SUBCOLLECTION),
    orderBy('createdAt', 'desc')
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: timestampToDate(doc.data().createdAt as Timestamp),
  })) as Vocabulary[];
}

// Grammar Services
export async function getUserGrammars(userId: string): Promise<Grammar[]> {
  const userDocRef = doc(db, 'users', userId);
  const q = query(
    collection(userDocRef, GRAMMARS_SUBCOLLECTION),
    orderBy('createdAt', 'desc')
  );
 
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: timestampToDate(doc.data().createdAt as Timestamp),
  })) as Grammar[];
}

export async function getUserAnalysisPages(userId: string): Promise<AnalysisPage[]> {
  const userDocRef = doc(db, 'users', userId);
  const q = query(
    collection(userDocRef, ANALYSIS_PAGES_SUBCOLLECTION),
    orderBy('createdAt', 'desc')
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: timestampToDate(doc.data().createdAt as Timestamp),
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

export async function importVocabulary(
  userId: string,
  item: Pick<Vocabulary, 'term' | 'detail'>
): Promise<Vocabulary> {
  const createdAt = new Date();
  const userDocRef = doc(db, 'users', userId);
  const document = await addDoc(
    collection(userDocRef, VOCABULARIES_SUBCOLLECTION),
    { ...item, userId, createdAt }
  );

  return { id: document.id, ...item, userId, createdAt };
}

export async function importGrammar(
  userId: string,
  item: Pick<Grammar, 'point' | 'explanation'>
): Promise<Grammar> {
  const createdAt = new Date();
  const userDocRef = doc(db, 'users', userId);
  const document = await addDoc(
    collection(userDocRef, GRAMMARS_SUBCOLLECTION),
    { ...item, userId, createdAt }
  );

  return { id: document.id, ...item, userId, createdAt };
}
