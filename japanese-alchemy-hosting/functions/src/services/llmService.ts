import { SuccessResponse } from "../models/types";
import { LLM_PROVIDER } from "../config";
import { GeminiLlmService } from "./geminiLlmService";
import { ZaiLlmService } from "./zaiLlmService";

export interface LlmService {
  chatCompletion(systemPrompt: string, content: string): Promise<SuccessResponse>;
  streamCompletion(systemPrompt: string, content: string): Promise<Response>;
}

/**
 * Factory: creates the LlmService based on the LLM_PROVIDER constant in config.ts.
 */
export function createLlmService(): LlmService {
  switch (LLM_PROVIDER) {
    case "zai":
      return new ZaiLlmService();
    case "gemini":
    default:
      return new GeminiLlmService();
  }
}
