import { describe, expect, it } from "@jest/globals";
import { BedrockPayloadAdapter } from "../../src/services/bedrockPayloadAdapter";

describe("BedrockPayloadAdapter", () => {
  it("sends the system prompt as the string-valued Responses instructions field", () => {
    const systemPrompt = "Explain this Japanese text.";
    const payload = new BedrockPayloadAdapter().toBedrockRequest(
      systemPrompt,
      "日本語"
    ) as { instructions: unknown; input: unknown };

    expect(payload.instructions).toBe(systemPrompt);
    expect(payload.input).toEqual([
      { type: "input_text", text: "日本語" },
    ]);
  });
});
