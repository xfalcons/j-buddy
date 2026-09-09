import { describe, it, expect, jest } from "@jest/globals";
import * as functions from "firebase-functions";
import { shouldRetry, LlmServiceChain } from "../../src/services/llmRetryService";
import { createLlmService } from "../../src/services/llmService";

// Mock the config so services can be instantiated without real secrets.
jest.mock("../../src/config", () => ({
  getConfig: () => ({
      gemini: {
        api_url: "https://test-gemini.com",
        api_key: "test-gemini-key",
        model: "test-gemini-model",
      },
      zai: {
        api_url: "https://test-zai.com",
        api_key: "test-zai-key",
        model: "test-zai-model",
      },
    }),
  LLM_PROVIDER: "gemini",
  LLM_CHAIN: ["gemini", "zai"] as const,
}));

describe("shouldRetry", () => {
  describe("HttpsError with HTTP status in message", () => {
    it("returns true for 429 Too Many Requests", () => {
      const error = new functions.https.HttpsError(
        "internal",
        "Gemini API error: 429 Too Many Requests"
      );
      expect(shouldRetry(error)).toBe(true);
    });

    it("returns true for 500 Internal Server Error", () => {
      const error = new functions.https.HttpsError(
        "internal",
        "Gemini API error: 500 Internal Server Error"
      );
      expect(shouldRetry(error)).toBe(true);
    });

    it("returns true for 502 Bad Gateway", () => {
      const error = new functions.https.HttpsError(
        "internal",
        "ZAI API error: 502 Bad Gateway"
      );
      expect(shouldRetry(error)).toBe(true);
    });

    it("returns true for 503 Service Unavailable", () => {
      const error = new functions.https.HttpsError(
        "internal",
        "Gemini API error: 503 Service Unavailable"
      );
      expect(shouldRetry(error)).toBe(true);
    });

    it("returns false for 400 Bad Request", () => {
      const error = new functions.https.HttpsError(
        "invalid-argument",
        "Gemini API error: 400 Bad Request"
      );
      expect(shouldRetry(error)).toBe(false);
    });

    it("returns false for 401 Unauthorized", () => {
      const error = new functions.https.HttpsError(
        "unauthenticated",
        "Gemini API error: 401 Unauthorized"
      );
      expect(shouldRetry(error)).toBe(false);
    });

    it("returns false for 403 Forbidden", () => {
      const error = new functions.https.HttpsError(
        "permission-denied",
        "ZAI API error: 403 Forbidden"
      );
      expect(shouldRetry(error)).toBe(false);
    });

    it("returns false for plain internal error without status", () => {
      const error = new functions.https.HttpsError(
        "internal",
        "Unknown error"
      );
      expect(shouldRetry(error)).toBe(false);
    });
  });

  describe("TypeError / network errors", () => {
    it("returns true for TypeError", () => {
      expect(shouldRetry(new TypeError("fetch failed"))).toBe(true);
    });

    it("returns true for TypeError with connection refused", () => {
      expect(shouldRetry(new TypeError("connect ECONNREFUSED"))).toBe(true);
    });

    it("returns true for Error with ETIMEDOUT", () => {
      expect(shouldRetry(new Error("ETIMEDOUT"))).toBe(true);
    });

    it("returns true for Error with ECONNREFUSED", () => {
      expect(shouldRetry(new Error("ECONNREFUSED"))).toBe(true);
    });

    it("returns true for Error with ENOTFOUND", () => {
      expect(shouldRetry(new Error("ENOTFOUND"))).toBe(true);
    });

    it("returns false for generic Error", () => {
      expect(shouldRetry(new Error("Some random error"))).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false for null", () => {
      expect(shouldRetry(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(shouldRetry(undefined)).toBe(false);
    });

    it("returns false for a string", () => {
      expect(shouldRetry("error")).toBe(false);
    });
  });
});

describe("createLlmService factory", () => {
  it("returns LlmServiceChain when called without argument", () => {
    const service = createLlmService();
    expect(service).toBeInstanceOf(LlmServiceChain);
  });

  it("returns GeminiLlmService when called with 'gemini'", () => {
    const service = createLlmService("gemini");
    expect(service).not.toBeInstanceOf(LlmServiceChain);
  });

  it("returns ZaiLlmService when called with 'zai'", () => {
    const service = createLlmService("zai");
    expect(service).not.toBeInstanceOf(LlmServiceChain);
  });
});
