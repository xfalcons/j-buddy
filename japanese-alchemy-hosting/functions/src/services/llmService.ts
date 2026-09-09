import { AiProvider, LlmUsage, SuccessResponse } from "../models/types";
import { GeminiLlmService } from "./geminiLlmService";
import { LlmServiceChain } from "./llmRetryService";
import { ZaiLlmService } from "./zaiLlmService";
import { BedrockResponsesService } from "./bedrockResponsesService";
import { BedrockChatService } from "./bedrockChatService";

export interface LlmService {
  chatCompletion(systemPrompt: string, content: string): Promise<LlmBatchCompletion>;
  streamCompletion(systemPrompt: string, content: string): Promise<LlmStreamCompletion>;
}

export interface LlmBatchCompletion {
  response: SuccessResponse;
  requestedModel: string;
  usage?: LlmUsage;
  responseModel?: string;
  finishReason?: string | null;
}

export interface LlmStreamCompletion {
  response: Response;
  requestedModel: string;
}

/**
 * Factory: creates an LlmService for an explicitly selected AI, or a
 * sequential fallback chain when no selection is supplied.
 */
export function createLlmService(ai?: AiProvider): LlmService {
  if (ai !== undefined) {
    switch (ai) {
      case "bedrock-response":
        return new BedrockResponsesService();
      case "bedrock-chat":
        return new BedrockChatService();
      case "zai":
        return new ZaiLlmService();
      case "gemini":
      default:
        return new GeminiLlmService();
    }
  }
  return new LlmServiceChain();
}
