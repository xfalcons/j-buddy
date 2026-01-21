import * as admin from "firebase-admin";
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { configSecret } from "../src/config";

// Mock firebase-functions/params
jest.mock("firebase-functions/params", () => ({
  defineJsonSecret: jest.fn((name: string) => ({
    name,
    value: jest.fn(() => ({
      google: {
        api_url: "https://test-api-url.com",
      },
      gemini: {
        api_key: "test-api-key",
        model: "test-model",
      },
    })),
  })),
}));

import { getConfig } from "../src/config";

describe("Configuration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should define secret with correct name", () => {
    expect(configSecret.name).toBe("JAPANESE_ALCHEMY_CONFIG");
  });

  it("should return correct configuration structure", () => {
    const config = getConfig();

    expect(config).toBeDefined();
    expect(config).toHaveProperty("google");
    expect(config).toHaveProperty("gemini");
  });

  it("should return correct API URL", () => {
    const config = getConfig();

    expect(config.google.api_url).toBeDefined();
    expect(typeof config.google.api_url).toBe("string");
  });

  it("should return correct Gemini API key", () => {
    const config = getConfig();

    expect(config.gemini.api_key).toBeDefined();
    expect(typeof config.gemini.api_key).toBe("string");
  });

  it("should return correct model", () => {
    const config = getConfig();

    expect(config.gemini.model).toBeDefined();
    expect(typeof config.gemini.model).toBe("string");
  });
});
