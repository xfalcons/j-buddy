"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLlmService = void 0;
const config_1 = require("../config");
const geminiLlmService_1 = require("./geminiLlmService");
const zaiLlmService_1 = require("./zaiLlmService");
/**
 * Factory: creates the LlmService based on the LLM_PROVIDER constant in config.ts.
 */
function createLlmService() {
    switch (config_1.LLM_PROVIDER) {
        case "zai":
            return new zaiLlmService_1.ZaiLlmService();
        case "gemini":
        default:
            return new geminiLlmService_1.GeminiLlmService();
    }
}
exports.createLlmService = createLlmService;
//# sourceMappingURL=llmService.js.map