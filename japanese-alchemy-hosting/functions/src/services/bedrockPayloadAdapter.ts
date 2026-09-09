import { SuccessResponse } from "../models/types";

/**
 * BedrockPayloadAdapter translates between J-Buddy's LlmRequest shape
 * and Bedrock /openai/v1/responses format.
 */
export class BedrockPayloadAdapter {
  /**
   * Converts J-Buddy's request format to Bedrock /openai/v1/responses format.
   * - system prompt → instructions string
   * - user content → input string
   */
  toBedrockRequest(systemPrompt: string, content: string): object {
    return {
      model: "gemma-2-9b-it",
      instructions: systemPrompt,
      input: content,
      temperature: 0.1,
      max_tokens: 8192,
      stream: false,
    };
  }

  /**
   * Converts Bedrock response to J-Buddy's SuccessResponse format.
   * - Extracts text from content blocks
   * - Maps usage: input_tokens → prompt_tokens, output_tokens → completion_tokens
   */
  toLlmResponse(body: any): SuccessResponse {
    const contentBlocks = body.output?.content || [];
    const text = contentBlocks
      .filter((block: any) => block.type === "content_block")
      .map((block: any) => block.text)
      .join("");

    return {
      success: true,
      data: text,
      timestamp: Date.now(),
    };
  }

  /**
   * Converts Bedrock error response to HttpsError.
   * - 400 → "invalid-argument"
   * - 401/403 → "unauthenticated"
   * - 429 → "resource-exhausted"
   * - 5xx → "internal"
   */
  toLlmResponseError(status: number): any {
    switch (status) {
      case 400:
        return new Error(`invalid-argument: Bedrock API error`);
      case 401:
      case 403:
        return new Error(`unauthenticated: Bedrock API error`);
      case 429:
        return new Error(`resource-exhausted: Bedrock API error`);
      default:
        if (status >= 500 && status < 600) {
          return new Error(`internal: Bedrock API error`);
        }
        return new Error(`internal: Bedrock API error`);
    }
  }
}
