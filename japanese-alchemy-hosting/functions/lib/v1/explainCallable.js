"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.explainHandler = void 0;
const functions = __importStar(require("firebase-functions"));
const analysisMessage_1 = require("../models/analysisMessage");
const systemPromptV1_1 = require("../models/systemPromptV1");
const systemPromptV2_1 = require("../models/systemPromptV2");
const llmService_1 = require("../services/llmService");
const logger_1 = require("../utils/logger");
const requestValidation_1 = require("./requestValidation");
async function explainHandler(request) {
    logger_1.logger.setContext(request);
    const data = request.data;
    // Server-authoritative input validation (content/context/prompt).
    const validation = (0, requestValidation_1.validateExplainRequest)(data);
    if (!validation.ok) {
        logger_1.logger.error(`Invalid request: ${validation.error}`);
        throw new functions.https.HttpsError("invalid-argument", validation.error ?? "Invalid request");
    }
    // Default to "v2" to match the Chrome extension and the streaming handler (KTD1).
    const { content, prompt = "v2", context_before, context_after } = data;
    logger_1.logger.info(`Received explain request with prompt version: ${prompt}`);
    logger_1.logger.info(`Content: ${content.substring(0, 100)}...`);
    const systemPrompt = prompt === "v2" ? systemPromptV2_1.SYSTEM_PROMPT_V2 : systemPromptV1_1.SYSTEM_PROMPT_V1;
    try {
        const llmService = (0, llmService_1.createLlmService)();
        const result = await llmService.chatCompletion(systemPrompt, (0, analysisMessage_1.buildAnalysisMessage)(content, { before: context_before, after: context_after }));
        logger_1.logger.info("Explain request completed successfully");
        return result;
    }
    catch (error) {
        logger_1.logger.error("Error in explain callable", error);
        throw new functions.https.HttpsError("internal", error instanceof Error ? error.message : "Unknown error occurred");
    }
}
exports.explainHandler = explainHandler;
//# sourceMappingURL=explainCallable.js.map