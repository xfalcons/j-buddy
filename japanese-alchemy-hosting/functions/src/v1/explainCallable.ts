import * as functions from "firebase-functions";
import { ExplainRequest, SuccessResponse } from "../models/types";
import { buildAnalysisMessage } from "../models/analysisMessage";
import { SYSTEM_PROMPT_V1 } from "../models/systemPromptV1";
import { SYSTEM_PROMPT_V2 } from "../models/systemPromptV2";
import { createLlmService } from "../services/llmService";
import { logLlmUsageTelemetry } from "../services/llmUsageTelemetry";
import { logger } from "../utils/logger";
import { validateExplainRequest } from "./requestValidation";
import { checkRateLimit } from "./rateLimiter";

export async function explainHandler(request: any): Promise<SuccessResponse> {
  logger.setContext(request);

  const data = request.data as ExplainRequest;
  // Server-authoritative input validation (content/context/prompt).
  const validation = validateExplainRequest(data);
  if (!validation.ok) {
    logger.error(`Invalid request: ${validation.error}`);
    throw new functions.https.HttpsError(
      "invalid-argument",
      validation.error ?? "Invalid request"
    );
  }

  // Defaults match the Chrome extension and streaming callable.
  const { content, prompt = "v2", context_before, context_after } = data;

  // Per-IP rate limit (parity with explainStreamCallable). The callable's client IP is
  // on the underlying Express request.
  const rateLimit = await checkRateLimit(request.rawRequest?.ip);
  if (!rateLimit.allowed) {
    const isLimiterError = rateLimit.reason === "limiter-error";
    const code = isLimiterError ? "unavailable" : "resource-exhausted";
    logger.warn(`Request denied: ${rateLimit.reason ?? "rate-limited"}`);
    throw new functions.https.HttpsError(
      code,
      isLimiterError ? "Rate limiter temporarily unavailable" : "Too many requests"
    );
  }

  logger.info(`Received explain request with prompt version: ${prompt}`);
  logger.info(`Content: ${content.substring(0, 100)}...`);

  const systemPrompt = prompt === "v2" ? SYSTEM_PROMPT_V2 : SYSTEM_PROMPT_V1;

  try {
    const llmService = createLlmService("gemini");
    const completion = await llmService.chatCompletion(
      systemPrompt,
      buildAnalysisMessage(content, { before: context_before, after: context_after })
    );

    logLlmUsageTelemetry({
      provider: "gemini",
      requestedModel: completion.requestedModel,
      responseModel: completion.responseModel,
      operation: "batch",
      rawUsage: completion.usage,
      finishReason: completion.finishReason,
      completed: true,
    });
    logger.info("Explain request completed successfully");
    return completion.response;
  } catch (error) {
    logger.error("Error in explain callable", error);
    throw new functions.https.HttpsError(
      "internal",
      error instanceof Error ? error.message : "Unknown error occurred"
    );
  }
}
