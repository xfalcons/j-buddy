import * as functions from "firebase-functions";
import { LlmRequest, LlmResponse, SuccessResponse } from "../models/types";
import { configSecret } from "../config";
import { LlmBatchCompletion, LlmService, LlmStreamCompletion } from "./llmService";

export class ZaiLlmService implements LlmService {
  private apiUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    const config = configSecret.value();
    this.apiUrl = config.zai.api_url;
    this.apiKey = config.zai.api_key;
    this.model = config.zai.model;

    if (!this.apiKey) {
      throw new Error("ZAI API key not found in JAPANESE_ALCHEMY_CONFIG secret");
    }
  }

  async streamCompletion(systemPrompt: string, content: string): Promise<LlmStreamCompletion> {
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: content },
    ];

    const payload: LlmRequest = {
      messages,
      model: this.model,
      temperature: 0.1,
      max_tokens: 8192,
      stream: true,
    };

    functions.logger.info("Calling ZAI API (streaming)", {
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
      functions.logger.error("ZAI API Error (streaming)", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new functions.https.HttpsError(
        "internal",
        `ZAI API error: ${response.status} ${response.statusText}`
      );
    }

    return { response, requestedModel: this.model };
  }

  async chatCompletion(systemPrompt: string, content: string): Promise<LlmBatchCompletion> {
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: content },
    ];

    const payload: LlmRequest = {
      messages,
      model: this.model,
      temperature: 0.1,
      max_tokens: 8192,
    };

    functions.logger.info("Calling ZAI API", {
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
      functions.logger.error("ZAI API Error", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new functions.https.HttpsError(
        "internal",
        `ZAI API error: ${response.status} ${response.statusText}`
      );
    }

    functions.logger.info("ZAI API Success");
    const data = await response.json() as LlmResponse;

    const result: SuccessResponse = {
      success: true,
      data: data.choices[0].message.content,
      timestamp: Date.now(),
    };

    return {
      response: result,
      requestedModel: this.model,
      usage: data.usage,
      responseModel: data.model,
      finishReason: data.choices[0].finish_reason,
    };
  }
}
