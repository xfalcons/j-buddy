export interface Vocabulary {
  id: string;
  term: string;
  detail: string;
  createdAt: Date;
  userId: string;
}

export interface Grammar {
  id: string;
  point: string;
  explanation: string;
  createdAt: Date;
  userId: string;
}
