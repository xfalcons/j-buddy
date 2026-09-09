import { describe, expect, it } from "@jest/globals";
import { BedrockPayloadAdapter } from "../../src/services/bedrockPayloadAdapter";

describe("BedrockPayloadAdapter", () => {
  it("sends string-valued instructions and input accepted by the Responses API", () => {
    const systemPrompt = "Explain this Japanese text.";
    const payload = new BedrockPayloadAdapter().toBedrockRequest(
      systemPrompt,
      "日本語"
    ) as { instructions: unknown; input: unknown };

    expect(payload.instructions).toBe(systemPrompt);
    expect(payload.input).toBe("日本語");
  });
});
