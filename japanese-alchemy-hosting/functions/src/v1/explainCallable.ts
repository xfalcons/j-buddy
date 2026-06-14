import * as functions from "firebase-functions";
import { ExplainRequest, SuccessResponse } from "../models/types";
import { buildAnalysisMessage } from "../models/analysisMessage";
import { SYSTEM_PROMPT_V1 } from "../models/systemPromptV1";
import { SYSTEM_PROMPT_V2 } from "../models/systemPromptV2";
import { createLlmService } from "../services/llmService";
import { logger } from "../utils/logger";

export async function explainHandler(request: any): Promise<SuccessResponse> {
  logger.setContext(request);

  const data = request.data as ExplainRequest;
  // Default to "v2" to match the Chrome extension and the streaming handler (KTD1).
  const { content, prompt = "v2", context_before, context_after } = data;

  if (!content) {
    logger.error("Invalid request: content is required");
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Content is required"
    );
  }

  if (prompt !== "v1" && prompt !== "v2") {
    logger.error(`Invalid prompt version: ${prompt}`);
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Prompt must be 'v1' or 'v2'"
    );
  }

  logger.info(`Received explain request with prompt version: ${prompt}`);
  logger.info(`Content: ${content.substring(0, 100)}...`);

  const systemPrompt = prompt === "v2" ? SYSTEM_PROMPT_V2 : SYSTEM_PROMPT_V1;

  try {
    const llmService = createLlmService();
    const result: SuccessResponse = await llmService.chatCompletion(
      systemPrompt,
      buildAnalysisMessage(content, { before: context_before, after: context_after })
    );

    logger.info("Explain request completed successfully");
    return result;
  } catch (error) {
    logger.error("Error in explain callable", error);
    throw new functions.https.HttpsError(
      "internal",
      error instanceof Error ? error.message : "Unknown error occurred"
    );
  }
}
