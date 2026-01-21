// Response types
export interface SuccessResponse {
  success: boolean;
  data?: any;
  timestamp?: number;
}

export interface FailureResponse {
  success: boolean;
  code: number;
  message: string;
}

// Firestore types
export interface VocabularyItem {
  id?: string;
  term: string;
  detail: string;
  createdAt: number;
}

export interface GrammarItem {
  id?: string;
  point: string;
  explanation: string;
  createdAt: number;
}

// API request types
export interface ExplainRequest {
  content: string;
  prompt?: "v1" | "v2";
}

export interface SaveItemsRequest {
  userId?: string | null;
  analysis: {
    is_shared?: boolean;
    words?: Array<{ term: string; [key: string]: any }>;
    grammars?: Array<{ point: string; [key: string]: any }>;
    metadata?: {
      source_text?: string;
      source_url?: string;
      saved_at?: string;
    };
  };
}

export interface SaveItemsResponse {
  success: boolean;
  message: string;
  saved: {
    words_count: number;
    grammars_count: number;
  };
}

// Gemini API types
export interface GeminiMessage {
  role: string;
  content: string;
}

export interface GeminiRequest {
  messages: GeminiMessage[];
  model: string;
  temperature: number;
  max_tokens: number;
}

export interface GeminiResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}
