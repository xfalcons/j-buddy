import { AiProvider, SuccessResponse } from "../models/types";
import { LLM_PROVIDER } from "../config";
import { GeminiLlmService } from "./geminiLlmService";
import { ZaiLlmService } from "./zaiLlmService";

export interface LlmService {
  chatCompletion(systemPrompt: string, content: string): Promise<SuccessResponse>;
  streamCompletion(systemPrompt: string, content: string): Promise<Response>;
}

/**
 * Factory: creates an LlmService for an explicitly selected AI, or retains the
 * configured provider when no selection is supplied by a caller outside the
 * explain request handlers.
 */
export function createLlmService(ai?: AiProvider): LlmService {
  switch (ai ?? LLM_PROVIDER) {
    case "zai":
      return new ZaiLlmService();
    case "gemini":
    default:
      return new GeminiLlmService();
  }
}
