"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLlmService = void 0;
const config_1 = require("../config");
const geminiLlmService_1 = require("./geminiLlmService");
const zaiLlmService_1 = require("./zaiLlmService");
/**
 * Factory: creates an LlmService for an explicitly selected AI, or retains the
 * configured provider when no selection is supplied by a caller outside the
 * explain request handlers.
 */
function createLlmService(ai) {
    switch (ai ?? config_1.LLM_PROVIDER) {
        case "zai":
            return new zaiLlmService_1.ZaiLlmService();
        case "gemini":
        default:
            return new geminiLlmService_1.GeminiLlmService();
    }
}
exports.createLlmService = createLlmService;
//# sourceMappingURL=llmService.js.map