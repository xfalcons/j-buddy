import { HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest, CallableResponse } from "firebase-functions/v2/https";
import { buildAnalysisMessage } from "../models/analysisMessage";
import { SYSTEM_PROMPT_V1 } from "../models/systemPromptV1";
import { SYSTEM_PROMPT_V2 } from "../models/systemPromptV2";
import { createLlmService } from "../services/llmService";
import { logLlmUsageTelemetry } from "../services/llmUsageTelemetry";
import { logger } from "../utils/logger";
import { isParsedBodyTooLarge, validateExplainRequest } from "./requestValidation";
import { checkRateLimit, rateLimitKey } from "./rateLimiter";
import { consumeLlmStream } from "./llmStreamDeltas";

interface StreamChunk {
  content: string;
}

interface CallableStreamResult {
  success: boolean;
  error?: string;
}

function clientTag(ip?: string): string {
  return ip ? rateLimitKey(ip) : "unknown";
}

function callableErrorForRateLimit(reason?: string): HttpsError {
  if (reason === "limiter-error") {
    return new HttpsError("unavailable", "Rate limiter temporarily unavailable");
  }
  return new HttpsError("resource-exhausted", "Too many requests");
}

/** Streams managed-provider analysis through the Firebase callable protocol. */
export async function explainStreamCallableHandler(
  request: CallableRequest,
  response?: CallableResponse<StreamChunk>
): Promise<CallableStreamResult> {
  logger.setContext(request);

  if (isParsedBodyTooLarge(request.data)) {
    logger.warn("Rejected oversized callable request body", {
      client: clientTag(request.rawRequest.ip),
    });
    throw new HttpsError("invalid-argument", "Request too large");
  }

  const validation = validateExplainRequest(request.data);
  if (!validation.ok) {
    logger.warn(`Rejected invalid callable request: ${validation.error}`, {
      client: clientTag(request.rawRequest.ip),
    });
    throw new HttpsError("invalid-argument", validation.error ?? "Invalid request");
  }

  const rateLimit = await checkRateLimit(request.rawRequest.ip);
  if (!rateLimit.allowed) {
    logger.warn(`Callable request denied: ${rateLimit.reason ?? "rate-limited"}`, {
      client: clientTag(request.rawRequest.ip),
    });
    throw callableErrorForRateLimit(rateLimit.reason);
  }

  const { content, prompt = "v2", context_before, context_after } = request.data as any;
  const systemPrompt = prompt === "v2" ? SYSTEM_PROMPT_V2 : SYSTEM_PROMPT_V1;

  try {
    const llmService = createLlmService("gemini");
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
      provider: "gemini",
      requestedModel: completion.requestedModel,
      responseModel: streamResult.responseModel,
      operation: "stream",
      rawUsage: streamResult.usage,
      finishReason: streamResult.finishReason,
      completed: streamResult.completed,
    });

    return { success: true };
  } catch (error) {
    logger.error("Error in callable streaming explain", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
