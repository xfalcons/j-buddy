import * as functions from "firebase-functions";
import { ExplainRequest, SuccessResponse } from "../models/types";
import { buildAnalysisMessage } from "../models/analysisMessage";
import { SYSTEM_PROMPT_V1 } from "../models/systemPromptV1";
import { SYSTEM_PROMPT_V2 } from "../models/systemPromptV2";
import { createLlmService } from "../services/llmService";
import { logLlmUsageTelemetry } from "../services/llmUsageTelemetry";
import { logger } from "../utils/logger";
import { getDailyAllowanceConfig } from "../config";
import { validateExplainRequest } from "./requestValidation";
import {
  admitDailyAllowance,
  AllowanceStatus,
  httpsErrorForDeniedAllowance,
} from "./dailyAllowance";

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
  const { content, prompt = "v2", context_before, context_after, ai } = data;

  const allowanceConfig = getDailyAllowanceConfig();
  let allowance: AllowanceStatus | undefined;
  if (allowanceConfig.enabled) {
    const decision = await admitDailyAllowance({
      uid: request.auth?.uid,
      ip: request.rawRequest?.ip,
      activeHmacKey: allowanceConfig.activeHmacKey,
      previousHmacKey: allowanceConfig.previousHmacKey,
      endpoint: "explain",
    });
    if (!decision.allowed) {
      const error = httpsErrorForDeniedAllowance(decision);
      throw new functions.https.HttpsError(error.code, error.message, error.details);
    }
    allowance = {
      limit: decision.limit,
      remaining: decision.remaining,
      resetAt: decision.resetAt,
    };
  }

  logger.info(`Received explain request with prompt version: ${prompt}`);
  logger.info(`Content: ${content.substring(0, 100)}...`);

  const systemPrompt = prompt === "v2" ? SYSTEM_PROMPT_V2 : SYSTEM_PROMPT_V1;

  try {
    const llmService = createLlmService(ai);
    const completion = await llmService.chatCompletion(
      systemPrompt,
      buildAnalysisMessage(content, { before: context_before, after: context_after })
    );

    logLlmUsageTelemetry({
      provider: (ai as any) || "gemini",
      requestedModel: completion.requestedModel,
      responseModel: completion.responseModel,
      operation: "batch",
      rawUsage: completion.usage,
      finishReason: completion.finishReason,
      completed: true,
    });
    logger.info("Explain request completed successfully");
    return { ...completion.response, allowance };
  } catch (error) {
    logger.error("Error in explain callable", error);
    throw new functions.https.HttpsError(
      "internal",
      error instanceof Error ? error.message : "Unknown error occurred",
      allowance ? { allowance, consumedAllowance: true } : undefined
    );
  }
}
