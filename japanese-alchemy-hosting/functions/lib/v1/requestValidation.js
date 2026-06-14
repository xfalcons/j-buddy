"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBodyTooLarge = exports.validateExplainRequest = exports.MAX_REQUEST_BYTES = exports.MAX_CONTENT_LENGTH = exports.MIN_CONTENT_LENGTH = void 0;
const analysisMessage_1 = require("../models/analysisMessage");
exports.MIN_CONTENT_LENGTH = 2;
exports.MAX_CONTENT_LENGTH = 500;
// Envelope ceiling for the streaming endpoint. The platform-level body cap and
// field-level validation are the backstops for under-reported/chunked bodies.
exports.MAX_REQUEST_BYTES = 16 * 1024;
/**
 * Validate the explain request body. Shared by explainStream and explain so the
 * analysis-text contract cannot drift between surfaces. Server-authoritative:
 * never trusts the client's 2-500 contract.
 *
 * @returns `{ ok, error, status }` — `status` is the HTTP code (stream) and
 * maps to an `invalid-argument` error on the callable.
 */
function validateExplainRequest(body) {
    const content = body?.content;
    if (typeof content !== "string" ||
        content.length < exports.MIN_CONTENT_LENGTH ||
        content.length > exports.MAX_CONTENT_LENGTH) {
        return {
            ok: false,
            status: 400,
            error: `content must be a string of ${exports.MIN_CONTENT_LENGTH}-${exports.MAX_CONTENT_LENGTH} characters`,
        };
    }
    const before = body?.context_before;
    if (before !== undefined) {
        if (typeof before !== "string" || before.length > analysisMessage_1.MAX_CONTEXT_CHARS) {
            return {
                ok: false,
                status: 400,
                error: `context_before must be a string of at most ${analysisMessage_1.MAX_CONTEXT_CHARS} characters`,
            };
        }
    }
    const after = body?.context_after;
    if (after !== undefined) {
        if (typeof after !== "string" || after.length > analysisMessage_1.MAX_CONTEXT_CHARS) {
            return {
                ok: false,
                status: 400,
                error: `context_after must be a string of at most ${analysisMessage_1.MAX_CONTEXT_CHARS} characters`,
            };
        }
    }
    const prompt = body?.prompt;
    if (prompt !== undefined && prompt !== "v1" && prompt !== "v2") {
        return { ok: false, status: 400, error: "Prompt must be 'v1' or 'v2'" };
    }
    return { ok: true, status: 200 };
}
exports.validateExplainRequest = validateExplainRequest;
/**
 * Body-size guard for the streaming endpoint. Rejects oversized requests before
 * any parsing work or LLM invocation, based on the Content-Length header.
 */
function isBodyTooLarge(req) {
    const cl = Number(req.header("content-length") ?? 0);
    return Number.isFinite(cl) && cl > exports.MAX_REQUEST_BYTES;
}
exports.isBodyTooLarge = isBodyTooLarge;
//# sourceMappingURL=requestValidation.js.map