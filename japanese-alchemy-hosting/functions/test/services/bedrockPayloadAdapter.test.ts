import { describe, expect, it } from "@jest/globals";
import { BedrockPayloadAdapter } from "../../src/services/bedrockPayloadAdapter";

describe("BedrockPayloadAdapter", () => {
  it("sends string-valued instructions and input accepted by the Responses API", () => {
    const model = "google.gemma-4-31b";
    const systemPrompt = "Explain this Japanese text.";
    const payload = new BedrockPayloadAdapter().toBedrockRequest(
      model,
      systemPrompt,
      "日本語"
    ) as { model: unknown; instructions: unknown; input: unknown };

    expect(payload.model).toBe(model);
    expect(payload.instructions).toBe(systemPrompt);
    expect(payload.input).toBe("日本語");
  });
});
