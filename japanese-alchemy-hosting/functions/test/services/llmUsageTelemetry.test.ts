import { describe, expect, it } from "@jest/globals";
import {
  LLM_PRICE_CATALOG,
  buildLlmUsageTelemetry,
} from "../../src/services/llmUsageTelemetry";

const validUsage = {
  prompt_tokens: 1_000_000,
  completion_tokens: 1_000_000,
  total_tokens: 2_000_000,
  prompt_tokens_details: { cached_tokens: 200_000 },
};

describe("buildLlmUsageTelemetry", () => {
  it.each(LLM_PRICE_CATALOG)(
    "calculates the cataloged $provider/$model cost exactly",
    (entry) => {
      const result = buildLlmUsageTelemetry({
        provider: entry.provider,
        requestedModel: entry.model,
        operation: "batch",
        rawUsage: validUsage,
      });

      const expectedUsd =
        entry.inputUsdPerMillion * 0.8 +
        entry.cachedInputUsdPerMillion * 0.2 +
        entry.outputUsdPerMillion;

      expect(result.usageStatus).toBe("recorded");
      expect(result.priceStatus).toBe("priced");
      expect(result.estimatedCostUsd).toBeCloseTo(expectedUsd, 10);
      expect(result.catalogVersion).toBeDefined();
    }
  );

  it("prices cached and uncached prompt tokens separately", () => {
    const result = buildLlmUsageTelemetry({
      provider: "gemini",
      requestedModel: "gemini-3-flash-preview",
      operation: "batch",
      rawUsage: validUsage,
    });

    expect(result.promptTokens).toBe(1_000_000);
    expect(result.cachedPromptTokens).toBe(200_000);
    expect(result.completionTokens).toBe(1_000_000);
    expect(result.estimatedCostUsd).toBe(3.41);
  });

  it("does not invent a cost for an exact-model mismatch", () => {
    const result = buildLlmUsageTelemetry({
      provider: "gemini",
      requestedModel: "gemini-3-flash",
      operation: "batch",
      rawUsage: validUsage,
    });

    expect(result.usageStatus).toBe("recorded");
    expect(result.priceStatus).toBe("price_unavailable");
    expect(result.estimatedCostUsd).toBeNull();
  });

  it.each([
    undefined,
    { prompt_tokens: -1, completion_tokens: 1 },
    { prompt_tokens: 1.5, completion_tokens: 1 },
    { prompt_tokens: Number.POSITIVE_INFINITY, completion_tokens: 1 },
    {
      prompt_tokens: 1,
      completion_tokens: 1,
      prompt_tokens_details: { cached_tokens: 2 },
    },
  ])("keeps malformed usage non-fatal", (rawUsage) => {
    const result = buildLlmUsageTelemetry({
      provider: "gemini",
      requestedModel: "gemini-3-flash-preview",
      operation: "stream",
      rawUsage,
    });

    expect(result.usageStatus).toMatch(/usage_(missing|malformed)/);
    expect(result.estimatedCostUsd).toBeNull();
  });
});
