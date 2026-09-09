import * as functions from "firebase-functions";
import { SuccessResponse, LlmUsage } from "../models/types";
import { getConfig } from "../config";
import {
  LlmBatchCompletion,
  LlmService,
  LlmStreamCompletion,
} from "./llmService";
import { BedrockPayloadAdapter } from "./bedrockPayloadAdapter";

export class BedrockResponsesService implements LlmService {
  private apiUrl: string;
  private apiKey: string;
  private model: string;
  private adapter: BedrockPayloadAdapter;

  constructor() {
    const config = getConfig();
    this.apiUrl = config.bedrock_response?.api_url;
    this.apiKey = config.bedrock_response?.api_key;
    this.model = config.bedrock_response?.model;
    this.adapter = new BedrockPayloadAdapter();

    if (!this.apiKey) {
      throw new Error(
        "Bedrock responses API key not found in JAPANESE_ALCHEMY_CONFIG secret"
      );
    }
  }

  async streamCompletion(
    systemPrompt: string,
    content: string
  ): Promise<LlmStreamCompletion> {
    const payload = this.adapter.toBedrockRequest(
      this.model,
      systemPrompt,
      content,
      true
    );

    functions.logger.info("Calling Bedrock Responses API (streaming)", {
      model: this.model,
      systemPromptLength: systemPrompt.length,
      contentLength: content.length,
    });

    const response = await fetch(`${this.apiUrl}/openai/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      functions.logger.error("Bedrock Responses API Error (streaming)", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new functions.https.HttpsError(
        "internal",
        `Bedrock Responses API error: ${response.status} ${response.statusText}`
      );
    }

    return { response, requestedModel: this.model };
  }

  async chatCompletion(
    systemPrompt: string,
    content: string
  ): Promise<LlmBatchCompletion> {
    const payload = this.adapter.toBedrockRequest(
      this.model,
      systemPrompt,
      content
    );

    functions.logger.info("Calling Bedrock Responses API", {
      model: this.model,
      systemPromptLength: systemPrompt.length,
      contentLength: content.length,
    });

    const response = await fetch(`${this.apiUrl}/openai/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      functions.logger.error("Bedrock Responses API Error", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new functions.https.HttpsError(
        "internal",
        `Bedrock Responses API error: ${response.status} ${response.statusText}`
      );
    }

    functions.logger.info("Bedrock Responses API Success");
    const data: any = await response.json();

    const result: SuccessResponse = this.adapter.toLlmResponse(data);

    const usage: LlmUsage | undefined = data.usage
      ? {
          prompt_tokens: data.usage.input_tokens,
          completion_tokens: data.usage.output_tokens,
          total_tokens: data.usage.total_tokens,
        }
      : undefined;

    return {
      response: result,
      requestedModel: this.model,
      usage: usage,
      responseModel: this.model,
      finishReason: "stop",
    };
  }
}
