export interface SharedItemMetadata {
  source_text?: string;
  source_url?: string;
  saved_at?: string;
}

export interface Vocabulary {
  id: string;
  term: string;
  detail: string;
  createdAt: Date;
  userId: string;
  isShared?: boolean;
  metadata?: SharedItemMetadata;
}

export interface Grammar {
  id: string;
  point: string;
  explanation: string;
  createdAt: Date;
  userId: string;
  isShared?: boolean;
  metadata?: SharedItemMetadata;
}

export interface StructuredAnalysis {
  words?: Array<{ term: string; detail: string }>;
  grammars?: Array<{ point: string; explanation: string }>;
}

export interface AnalysisPage {
  id: string;
  rendered_markdown: string;
  source_text: string;
  source_url: string;
  saved_at: string;
  createdAt: Date;
  structured_json?: StructuredAnalysis;
}
