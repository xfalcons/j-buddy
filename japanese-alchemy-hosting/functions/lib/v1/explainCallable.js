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
const systemPromptV1_1 = require("../models/systemPromptV1");
const systemPromptV2_1 = require("../models/systemPromptV2");
const geminiService_1 = require("../services/geminiService");
const logger_1 = require("../utils/logger");
async function explainHandler(request) {
    logger_1.logger.setContext(request);
    const data = request.data;
    const { content, prompt = "v1" } = data;
    if (!content) {
        logger_1.logger.error("Invalid request: content is required");
        throw new functions.https.HttpsError("invalid-argument", "Content is required");
    }
    if (prompt !== "v1" && prompt !== "v2") {
        logger_1.logger.error(`Invalid prompt version: ${prompt}`);
        throw new functions.https.HttpsError("invalid-argument", "Prompt must be 'v1' or 'v2'");
    }
    logger_1.logger.info(`Received explain request with prompt version: ${prompt}`);
    logger_1.logger.info(`Content: ${content.substring(0, 100)}...`);
    const systemPrompt = prompt === "v2" ? systemPromptV2_1.SYSTEM_PROMPT_V2 : systemPromptV1_1.SYSTEM_PROMPT_V1;
    try {
        const geminiService = new geminiService_1.GeminiService();
        const result = await geminiService.geminiChatCompletion(systemPrompt, content);
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