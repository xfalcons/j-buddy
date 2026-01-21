import * as functions from "firebase-functions";
import { GeminiRequest, GeminiResponse, SuccessResponse } from "../models/types";
import { configSecret } from "../config";

export class GeminiService {
  private apiUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    // Get configuration from the secret
    this.apiUrl = configSecret.value().google.api_url;
    this.apiKey = configSecret.value().gemini.api_key;
    this.model = configSecret.value().gemini.model;

    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY not found in JAPANESE_ALCHEMY_CONFIG secret');
    }
  }

  async geminiChatCompletion(systemPrompt: string, content: string): Promise<SuccessResponse> {
    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: content,
      },
    ];

    const payload: GeminiRequest = {
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
      throw new functions.https.HttpsError(
        "internal",
        `Gemini API error: ${response.status} ${response.statusText}`
      );
    }

    functions.logger.info("Gemini API Success");
    const data = await response.json() as GeminiResponse;
    functions.logger.debug("Gemini Response Data", data);

    const result: SuccessResponse = {
      success: true,
      data: data.choices[0].message.content,
      timestamp: Date.now(),
    };

    return result;
  }
}
