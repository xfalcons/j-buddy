import * as functions from "firebase-functions";
import { LlmRequest, LlmResponse, SuccessResponse } from "../models/types";
import { getConfig } from "../config";
import {
  LlmBatchCompletion,
  LlmService,
  LlmStreamCompletion,
} from "./llmService";

export class BedrockChatService implements LlmService {
  private apiUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    const config = getConfig();
    this.apiUrl = config.bedrock_chat?.api_url;
    this.apiKey = config.bedrock_chat?.api_key;
    this.model = config.bedrock_chat?.model;

    if (!this.apiKey) {
      throw new Error(
        "Bedrock chat API key not found in JAPANESE_ALCHEMY_CONFIG secret"
      );
    }
  }

  async streamCompletion(
    systemPrompt: string,
    content: string
  ): Promise<LlmStreamCompletion> {
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

    functions.logger.info("Calling Bedrock Chat API (streaming)", {
      model: this.model,
      messagesCount: messages.length,
    });

    const response = await fetch(`${this.apiUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      functions.logger.error("Bedrock Chat API Error (streaming)", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new functions.https.HttpsError(
        "internal",
        `Bedrock Chat API error: ${response.status} ${response.statusText}`
      );
    }

    return { response, requestedModel: this.model };
  }

  async chatCompletion(
    systemPrompt: string,
    content: string
  ): Promise<LlmBatchCompletion> {
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

    functions.logger.info("Calling Bedrock Chat API", {
      model: this.model,
      messagesCount: messages.length,
    });

    const response = await fetch(`${this.apiUrl}/openai/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      functions.logger.error("Bedrock Chat API Error", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new functions.https.HttpsError(
        "internal",
        `Bedrock Chat API error: ${response.status} ${response.statusText}`
      );
    }

    functions.logger.info("Bedrock Chat API Success");
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
