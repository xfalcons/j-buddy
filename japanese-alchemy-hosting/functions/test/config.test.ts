import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { getConfig, LLM_PROVIDER, runtimeSecrets } from "../src/config";

// Mock firebase-functions/params so defineJsonSecret returns a config object
// shaped like the real JAPANESE_ALCHEMY_CONFIG secret.
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
      bedrock_response: {
        api_url: "https://bedrock-responses.test-api-url.com",
        api_key: "test-bedrock-responses-key",
        model: "test-bedrock-responses-model",
      },
      bedrock_chat: {
        api_url: "https://bedrock-chat.test-api-url.com",
        api_key: "test-bedrock-chat-key",
        model: "test-bedrock-chat-model",
      },
    })),
  })),
}));

describe("Configuration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should bind the configuration secret to callable runtime options", () => {
    expect(runtimeSecrets[0].name).toBe("JAPANESE_ALCHEMY_CONFIG");
  });

  it("should return all provider configs", () => {
    const config = getConfig();

    expect(config).toBeDefined();
    expect(config).toHaveProperty("gemini");
    expect(config).toHaveProperty("zai");
    expect(config).toHaveProperty("bedrock_response");
    expect(config).toHaveProperty("bedrock_chat");
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

  it("should return the Bedrock provider configs", () => {
    const config = getConfig();

    expect(config.bedrock_response).toEqual({
      api_url: "https://bedrock-responses.test-api-url.com",
      api_key: "test-bedrock-responses-key",
      model: "test-bedrock-responses-model",
    });
    expect(config.bedrock_chat).toEqual({
      api_url: "https://bedrock-chat.test-api-url.com",
      api_key: "test-bedrock-chat-key",
      model: "test-bedrock-chat-model",
    });
  });

  it("should default the active provider to gemini", () => {
    expect(LLM_PROVIDER).toBe("gemini");
  });
});
