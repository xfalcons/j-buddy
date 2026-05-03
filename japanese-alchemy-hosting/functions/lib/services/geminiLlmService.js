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
exports.GeminiLlmService = void 0;
const functions = __importStar(require("firebase-functions"));
const config_1 = require("../config");
class GeminiLlmService {
    apiUrl;
    apiKey;
    model;
    constructor() {
        const config = config_1.configSecret.value();
        this.apiUrl = config.gemini.api_url;
        this.apiKey = config.gemini.api_key;
        this.model = config.gemini.model;
        if (!this.apiKey) {
            throw new Error("Gemini API key not found in JAPANESE_ALCHEMY_CONFIG secret");
        }
    }
    async streamCompletion(systemPrompt, content) {
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: content },
        ];
        const payload = {
            messages,
            model: this.model,
            temperature: 0.1,
            max_tokens: 8192,
            stream: true,
            extra_body: {
                google: {
                    thinking_config: {
                        thinking_budget: 512,
                        include_thoughts: false // Returns model's reasoning steps
                    }
                }
            }
        };
        functions.logger.info("Calling Gemini API (streaming)", {
            model: this.model,
            messagesCount: messages.length,
        });
        const response = await fetch(`${this.apiUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorText = await response.text();
            functions.logger.error("Gemini API Error (streaming)", {
                status: response.status,
                statusText: response.statusText,
                error: errorText,
            });
            throw new functions.https.HttpsError("internal", `Gemini API error: ${response.status} ${response.statusText}`);
        }
        return response;
    }
    async chatCompletion(systemPrompt, content) {
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: content },
        ];
        const payload = {
            messages,
            model: this.model,
            temperature: 0.1,
            max_tokens: 8192,
        };
        functions.logger.info("Calling Gemini API", {
            model: this.model,
            messagesCount: messages.length,
        });
        const response = await fetch(`${this.apiUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorText = await response.text();
            functions.logger.error("Gemini API Error", {
                status: response.status,
                statusText: response.statusText,
                error: errorText,
            });
            throw new functions.https.HttpsError("internal", `Gemini API error: ${response.status} ${response.statusText}`);
        }
        functions.logger.info("Gemini API Success");
        const data = await response.json();
        functions.logger.debug("Gemini Response Data", data);
        const result = {
            success: true,
            data: data.choices[0].message.content,
            timestamp: Date.now(),
        };
        return result;
    }
}
exports.GeminiLlmService = GeminiLlmService;
//# sourceMappingURL=geminiLlmService.js.map