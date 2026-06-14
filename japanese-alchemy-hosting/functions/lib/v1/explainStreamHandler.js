"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.explainStreamHandler = void 0;
const analysisMessage_1 = require("../models/analysisMessage");
const systemPromptV1_1 = require("../models/systemPromptV1");
const systemPromptV2_1 = require("../models/systemPromptV2");
const llmService_1 = require("../services/llmService");
const logger_1 = require("../utils/logger");
const requestValidation_1 = require("./requestValidation");
const rateLimiter_1 = require("./rateLimiter");
// HMAC'd client identifier for rejection logs (abuse correlation): never the
// raw IP, never request content.
function clientTag(ip) {
    return ip ? (0, rateLimiter_1.rateLimitKey)(ip) : "unknown";
}
async function explainStreamHandler(req, res) {
    // Reject oversized bodies before any work or SSE headers.
    if ((0, requestValidation_1.isBodyTooLarge)(req)) {
        logger_1.logger.warn("Rejected oversized request body (413)", { client: clientTag(req.ip) });
        res.status(413).json({ error: "Request too large" });
        return;
    }
    // Server-authoritative input validation (content/context/prompt).
    const validation = (0, requestValidation_1.validateExplainRequest)(req.body);
    if (!validation.ok) {
        logger_1.logger.warn(`Rejected invalid request: ${validation.error}`, {
            client: clientTag(req.ip),
        });
        res.status(validation.status).json({ error: validation.error });
        return;
    }
    // Per-IP rate limit (after validation, before the LLM call).
    const rateLimit = await (0, rateLimiter_1.checkRateLimit)(req.ip);
    if (!rateLimit.allowed) {
        logger_1.logger.warn(`Rate limit denied (429)${rateLimit.reason ? `: ${rateLimit.reason}` : ""}`, { client: clientTag(req.ip) });
        res.status(429).json({ error: "Too many requests" });
        return;
    }
    const { content, prompt = "v2", context_before, context_after } = req.body || {};
    logger_1.logger.info(`Streaming explain request with prompt version: ${prompt}`);
    logger_1.logger.info(`Content: ${content.substring(0, 100)}...`);
    if (context_before || context_after) {
        logger_1.logger.info(`Surrounding context present (before=${context_before ? context_before.length : 0} chars, after=${context_after ? context_after.length : 0} chars)`);
    }
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const sendSSE = (event, data) => {
        const dataStr = typeof data === "string" ? data : JSON.stringify(data);
        res.write(`event: ${event}\ndata: ${dataStr}\n\n`);
    };
    try {
        const systemPrompt = prompt === "v2" ? systemPromptV2_1.SYSTEM_PROMPT_V2 : systemPromptV1_1.SYSTEM_PROMPT_V1;
        const llmService = (0, llmService_1.createLlmService)();
        const t0 = Date.now();
        logger_1.logger.info("LLM API request initiated");
        const llmResponse = await llmService.streamCompletion(systemPrompt, (0, analysisMessage_1.buildAnalysisMessage)(content, { before: context_before, after: context_after }));
        const ttfb = Date.now() - t0;
        logger_1.logger.info(`LLM API headers received (TTFB): ${ttfb}ms`);
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
            if (done)
                break;
            if (!firstChunkSent) {
                const firstChunkMs = Date.now() - t0;
                logger_1.logger.info(`First content chunk forwarded to client: ${firstChunkMs}ms (body latency: ${firstChunkMs - ttfb}ms)`);
                firstChunkSent = true;
            }
            buffer += decoder.decode(value, { stream: true });
            // SSE frames from Gemini are separated by double newlines
            const lines = buffer.split("\n");
            // Keep the last incomplete line in the buffer
            buffer = lines.pop() || "";
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(":"))
                    continue;
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
                    }
                    catch {
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
                }
                catch {
                    // Skip
                }
            }
        }
        const totalMs = Date.now() - t0;
        sendSSE("done", "[DONE]");
        logger_1.logger.info(`Streaming explain request completed: ${totalMs}ms total (TTFB: ${ttfb}ms)`);
        res.end();
    }
    catch (error) {
        logger_1.logger.error("Error in streaming explain", error);
        sendSSE("error", { error: error instanceof Error ? error.message : "Unknown error" });
        res.end();
    }
}
exports.explainStreamHandler = explainStreamHandler;
//# sourceMappingURL=explainStreamHandler.js.map