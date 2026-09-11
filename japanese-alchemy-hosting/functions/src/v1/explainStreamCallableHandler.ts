import { HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest, CallableResponse } from "firebase-functions/v2/https";
import { buildAnalysisMessage } from "../models/analysisMessage";
import { SYSTEM_PROMPT_V1 } from "../models/systemPromptV1";
import { SYSTEM_PROMPT_V2 } from "../models/systemPromptV2";
import { createLlmService } from "../services/llmService";
import { logLlmUsageTelemetry } from "../services/llmUsageTelemetry";
import { logger } from "../utils/logger";
import { getDailyAllowanceConfig } from "../config";
import { isParsedBodyTooLarge, validateExplainRequest } from "./requestValidation";
import {
  admitDailyAllowance,
  AllowanceStatus,
  httpsErrorForDeniedAllowance,
} from "./dailyAllowance";
import { consumeLlmStream } from "./llmStreamDeltas";

interface StreamChunk {
  content: string;
}

interface CallableStreamResult {
  success: boolean;
  error?: string;
  allowance?: AllowanceStatus;
}

/** Streams managed-provider analysis through the Firebase callable protocol. */
export async function explainStreamCallableHandler(
  request: CallableRequest,
  response?: CallableResponse<StreamChunk>
): Promise<CallableStreamResult> {
  logger.setContext(request);

  if (isParsedBodyTooLarge(request.data)) {
    logger.warn("Rejected oversized callable request body", {
      client: "unknown",
    });
    throw new HttpsError("invalid-argument", "Request too large");
  }

  const validation = validateExplainRequest(request.data);
  if (!validation.ok) {
    logger.warn(`Rejected invalid callable request: ${validation.error}`, {
      client: "unknown",
    });
    throw new HttpsError("invalid-argument", validation.error ?? "Invalid request");
  }

  const allowanceConfig = getDailyAllowanceConfig();
  let allowance: AllowanceStatus | undefined;
  if (allowanceConfig.enabled) {
    const decision = await admitDailyAllowance({
      uid: request.auth?.uid,
      ip: request.rawRequest.ip,
      activeHmacKey: allowanceConfig.activeHmacKey,
      previousHmacKey: allowanceConfig.previousHmacKey,
      endpoint: "explainStreamCallable",
    });
    if (!decision.allowed) {
      const error = httpsErrorForDeniedAllowance(decision);
      throw new HttpsError(error.code, error.message, error.details);
    }
    allowance = {
      limit: decision.limit,
      remaining: decision.remaining,
      resetAt: decision.resetAt,
    };
  }

  const { content, prompt = "v2", context_before, context_after, ai } = request.data as any;
  const systemPrompt = prompt === "v2" ? SYSTEM_PROMPT_V2 : SYSTEM_PROMPT_V1;

  try {
    const llmService = createLlmService(ai);
    const completion = await llmService.streamCompletion(
      systemPrompt,
      buildAnalysisMessage(content, { before: context_before, after: context_after })
    );

    const streamResult = await consumeLlmStream(completion.response, async (delta) => {
      if (request.acceptsStreaming && response) {
        await response.sendChunk({ content: delta });
      }
    });

    logLlmUsageTelemetry({
      provider: (ai as any) || "gemini",
      requestedModel: completion.requestedModel,
      responseModel: streamResult.responseModel,
      operation: "stream",
      rawUsage: streamResult.usage,
      finishReason: streamResult.finishReason,
      completed: streamResult.completed,
    });

    return { success: true, allowance };
  } catch (error) {
    logger.error("Error in callable streaming explain", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error", allowance };
  }
}
