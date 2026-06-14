import { Request, Response } from "express";
import { buildAnalysisMessage } from "../models/analysisMessage";
import { SYSTEM_PROMPT_V1 } from "../models/systemPromptV1";
import { SYSTEM_PROMPT_V2 } from "../models/systemPromptV2";
import { createLlmService } from "../services/llmService";
import { logger } from "../utils/logger";

export async function explainStreamHandler(req: Request, res: Response): Promise<void> {
  const { content, prompt = "v2", context_before, context_after } = req.body || {};

  if (!content) {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  if (prompt !== "v1" && prompt !== "v2") {
    res.status(400).json({ error: "Prompt must be 'v1' or 'v2'" });
    return;
  }

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
