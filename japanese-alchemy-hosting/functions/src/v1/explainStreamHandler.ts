import { Request, Response } from "express";
import { buildAnalysisMessage } from "../models/analysisMessage";
import { SYSTEM_PROMPT_V1 } from "../models/systemPromptV1";
import { SYSTEM_PROMPT_V2 } from "../models/systemPromptV2";
import { createLlmService } from "../services/llmService";
import { logger } from "../utils/logger";
import { isBodyTooLarge, isParsedBodyTooLarge, validateExplainRequest } from "./requestValidation";
import { checkRateLimit, rateLimitKey } from "./rateLimiter";

// HMAC'd client identifier for rejection logs (abuse correlation): never the
// raw IP, never request content.
function clientTag(ip?: string): string {
  return ip ? rateLimitKey(ip) : "unknown";
}

export async function explainStreamHandler(req: Request, res: Response): Promise<void> {
  // Reject oversized bodies before any work or SSE headers. Two checks: the
  // Content-Length header (early) and the parsed body size (catches chunked /
  // under-reported bodies the header check misses).
  if (isBodyTooLarge(req) || isParsedBodyTooLarge(req.body)) {
    logger.warn("Rejected oversized request body (413)", { client: clientTag(req.ip) });
    res.status(413).json({ error: "Request too large" });
    return;
  }

  // Server-authoritative input validation (content/context/prompt).
  const validation = validateExplainRequest(req.body);
  if (!validation.ok) {
    logger.warn(`Rejected invalid request: ${validation.error}`, {
      client: clientTag(req.ip),
    });
    res.status(validation.status).json({ error: validation.error });
    return;
  }

  // Per-IP rate limit (after validation, before the LLM call). A limiter error
  // (Firestore down) fails closed as 503 so clients don't retry-loop into the
  // failing dependency; a genuine per-IP exhaustion is 429.
  const rateLimit = await checkRateLimit(req.ip);
  if (!rateLimit.allowed) {
    const isLimiterError = rateLimit.reason === "limiter-error";
    const status = isLimiterError ? 503 : 429;
    logger.warn(
      `Request denied (${status})${rateLimit.reason ? `: ${rateLimit.reason}` : ""}`,
      { client: clientTag(req.ip) }
    );
    if (isLimiterError) res.setHeader("Retry-After", "60");
    res
      .status(status)
      .json({ error: isLimiterError ? "Rate limiter temporarily unavailable" : "Too many requests" });
    return;
  }

  const { content, prompt = "v2", context_before, context_after } = req.body || {};

  logger.info(`Streaming explain request with prompt version: ${prompt}`);
  logger.info(`Content: ${content.substring(0, 100)}...`);
  if (context_before || context_after) {
    logger.info(
      `Surrounding context present (before=${context_before ? context_before.length : 0} chars, after=${context_after ? context_after.length : 0} chars)`
    );
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendSSE = (event: string, data: object | string) => {
    const dataStr = typeof data === "string" ? data : JSON.stringify(data);
    res.write(`event: ${event}\ndata: ${dataStr}\n\n`);
  };

  try {
    const systemPrompt = prompt === "v2" ? SYSTEM_PROMPT_V2 : SYSTEM_PROMPT_V1;
    const llmService = createLlmService();

    const t0 = Date.now();
    logger.info("LLM API request initiated");

    const llmResponse = await llmService.streamCompletion(
      systemPrompt,
      buildAnalysisMessage(content, { before: context_before, after: context_after })
    );

    const ttfb = Date.now() - t0;
    logger.info(`LLM API headers received (TTFB): ${ttfb}ms`);

    if (!llmResponse.body) {
      sendSSE("error", { error: "No response body from LLM provider" });
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    const reader = llmResponse.body.getReader();
    let buffer = "";
    let firstChunkSent = false;

    // eslint-disable-next-line no-constant-condition -- intentional streaming loop, broken by `done`
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (!firstChunkSent) {
        const firstChunkMs = Date.now() - t0;
        logger.info(`First content chunk forwarded to client: ${firstChunkMs}ms (body latency: ${firstChunkMs - ttfb}ms)`);
        firstChunkSent = true;
      }

      buffer += decoder.decode(value, { stream: true });

      // SSE frames from Gemini are separated by double newlines
      const lines = buffer.split("\n");
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        if (trimmed === "data: [DONE]") {
          sendSSE("done", "[DONE]");
          continue;
        }

        if (trimmed.startsWith("data: ")) {
          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              sendSSE("chunk", { content: delta });
            }
          } catch {
            // Malformed JSON — skip
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim() && buffer.trim() !== "data: [DONE]") {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data: ")) {
        const jsonStr = trimmed.slice(6);
        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            sendSSE("chunk", { content: delta });
          }
        } catch {
          // Skip
        }
      }
    }

    const totalMs = Date.now() - t0;
    sendSSE("done", "[DONE]");
    logger.info(`Streaming explain request completed: ${totalMs}ms total (TTFB: ${ttfb}ms)`);
    res.end();
  } catch (error) {
    logger.error("Error in streaming explain", error);
    sendSSE("error", { error: error instanceof Error ? error.message : "Unknown error" });
    res.end();
  }
}
