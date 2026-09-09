import * as functions from "firebase-functions";
import { LlmBatchCompletion, LlmService, LlmStreamCompletion, createLlmService } from "./llmService";
import { LLM_CHAIN } from "../config";

/**
 * Extracts the numeric HTTP status from a Firebase HttpsError message.
 * Services format messages as "<name> API error: <code> <text>",
 * so the last space-separated token is the status number.
 */
function extractHttpStatus(error: unknown): number | undefined {
  if (!(error instanceof functions.https.HttpsError)) {
    return undefined;
  }
  const msg = error.message;
  const parts = msg.split(":");
  if (parts.length === 0) return undefined;
  const lastPart = parts[parts.length - 1].trim();
  const statusMatch = lastPart.match(/^(\d{3})/);
  return statusMatch ? parseInt(statusMatch[1], 10) : undefined;
}

/**
 * Returns true if the error should trigger a retry with the next provider.
 *
 * Retryable:
 *   - HTTP 429 (rate limit) — extracted from HttpsError message
 *   - HTTP 5xx (server error) — extracted from HttpsError message
 *   - Network-level errors (TypeError from fetch, socket errors, etc.)
 *
 * Non-retryable:
 *   - HTTP 4xx (except 429) — bad request, unauthorized, not found, etc.
 *   - Any other Error not matching the network pattern
 */
export function shouldRetry(error: unknown): boolean {
  // Check for retryable HTTP status from HttpsError message
  const httpStatus = extractHttpStatus(error);
  if (httpStatus !== undefined && (httpStatus === 429 || (httpStatus >= 500 && httpStatus <= 599))) {
    return true;
  }

  // Check for network-level errors (TypeError from fetch, socket errors, etc.)
  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    const networkSignals = [
      "econnreset",
      "etimedout",
      "econnrefused",
      "enotfound",
      "fetch failed",
      "network error",
      "networkrequestfailed",
    ];
    if (networkSignals.some((signal) => msg.includes(signal))) {
      return true;
    }
  }

  return false;
}

/**
 * A chain of LLM providers that retries sequentially on 429/5xx errors.
 *
 * Built-in behaviors:
 * - Iterates through LLM_CHAIN (["gemini", "zai"]) in order
 * - Retries only on retryable errors (429, 5xx, network failures)
 * - Propagates non-retryable errors immediately (400, 401, 403, etc.)
 * - Logs each attempt and the ultimate provider on success
 * - For streaming: retries only before fetch resolves (R6/R7)
 */
export class LlmServiceChain implements LlmService {
  private providers: LlmService[];

  constructor() {
    this.providers = LLM_CHAIN.map((name) =>
      createLlmService(name as "gemini" | "zai")
    );
  }

  async chatCompletion(
    systemPrompt: string,
    content: string
  ): Promise<LlmBatchCompletion> {
    let lastError: Error | undefined;

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      const providerName = LLM_CHAIN[i];

      try {
        const result = await provider.chatCompletion(systemPrompt, content);
        functions.logger.info("LLM chain: batch completed", {
          provider: providerName,
        });
        return result;
      } catch (error) {
        if (!shouldRetry(error)) {
          functions.logger.error(
            `LLM chain: non-retryable error from ${providerName}`,
            error
          );
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
        functions.logger.warn(
          `LLM chain: ${providerName} failed (${lastError.message}), trying next`
        );
      }
    }

    // All providers failed with retryable errors
    throw lastError ?? new Error("All LLM providers failed");
  }

  async streamCompletion(
    systemPrompt: string,
    content: string
  ): Promise<LlmStreamCompletion> {
    let lastError: Error | undefined;

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      const providerName = LLM_CHAIN[i];

      try {
        const result = await provider.streamCompletion(systemPrompt, content);
        functions.logger.info("LLM chain: stream started", {
          provider: providerName,
        });
        return result;
      } catch (error) {
        if (!shouldRetry(error)) {
          functions.logger.error(
            `LLM chain: non-retryable error from ${providerName}`,
            error
          );
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
        functions.logger.warn(
          `LLM chain: ${providerName} failed (${lastError.message}), trying next`
        );
      }
    }

    // All providers failed with retryable errors
    throw lastError ?? new Error("All LLM providers failed");
  }
}
