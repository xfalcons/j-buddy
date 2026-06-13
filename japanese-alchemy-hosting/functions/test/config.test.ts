import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { configSecret, getConfig, LLM_PROVIDER } from "../src/config";

// Mock firebase-functions/params so defineJsonSecret returns a config object
// shaped like the real JAPANESE_ALCHEMY_CONFIG secret: { gemini, zai }.
jest.mock("firebase-functions/params", () => ({
  defineJsonSecret: jest.fn((name: string) => ({
    name,
    value: jest.fn(() => ({
      gemini: {
        api_url: "https://gemini.test-api-url.com",
        api_key: "test-gemini-key",
        model: "test-gemini-model",
      },
      zai: {
        api_url: "https://zai.test-api-url.com",
        api_key: "test-zai-key",
        model: "test-zai-model",
      },
    })),
  })),
}));

describe("Configuration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should define secret with correct name", () => {
    expect(configSecret.name).toBe("JAPANESE_ALCHEMY_CONFIG");
  });

  it("should return the gemini and zai provider configs", () => {
    const config = getConfig();

    expect(config).toBeDefined();
    expect(config).toHaveProperty("gemini");
    expect(config).toHaveProperty("zai");
  });

  it("should return the Gemini provider config", () => {
    const config = getConfig();

    expect(config.gemini.api_url).toBe("https://gemini.test-api-url.com");
    expect(config.gemini.api_key).toBe("test-gemini-key");
    expect(config.gemini.model).toBe("test-gemini-model");
  });

  it("should return the ZAI provider config", () => {
    const config = getConfig();

    expect(config.zai.api_url).toBe("https://zai.test-api-url.com");
    expect(config.zai.api_key).toBe("test-zai-key");
    expect(config.zai.model).toBe("test-zai-model");
  });

  it("should default the active provider to gemini", () => {
    expect(LLM_PROVIDER).toBe("gemini");
  });
});
