import {
  collection,
  getDocs,
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
