import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { GeminiService } from "../../src/services/geminiService";

// Mock fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Mock getConfig
jest.mock("../../src/config", () => ({
  getConfig: jest.fn(() => ({
    google: {
      api_url: "https://test-api-url.com",
    },
    gemini: {
      api_key: "test-api-key",
      model: "test-model",
    },
  })),
}));

describe("GeminiService", () => {
  let service: GeminiService;

  beforeEach(() => {
    service = new GeminiService();
    mockFetch.mockClear();
  });

  describe("Constructor", () => {
    it("should initialize with correct configuration", () => {
      expect(service).toBeDefined();
    });
  });

  describe("geminiChatCompletion", () => {
    const mockSystemPrompt = "You are a helpful assistant";
    const mockContent = "Test content";
    const mockResponse = {
      choices: [
        {
          message: {
            content: "Test response",
          },
        },
      ],
    };

    it("should call Gemini API with correct payload", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await service.geminiChatCompletion(mockSystemPrompt, mockContent);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://test-api-url.com/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-api-key",
          },
          body: JSON.stringify({
            messages: [
              { role: "system", content: mockSystemPrompt },
              { role: "user", content: mockContent },
            ],
            model: "test-model",
            temperature: 0.1,
            max_tokens: 8192,
          }),
        }
      );
    });

    it("should return successful response", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.geminiChatCompletion(mockSystemPrompt, mockContent);

      expect(result).toEqual({
        success: true,
        data: "Test response",
        timestamp: expect.any(Number),
      });
    });

    it("should throw error when API returns error", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Error details",
      });

      await expect(
        service.geminiChatCompletion(mockSystemPrompt, mockContent)
      ).rejects.toThrow("Gemini API error: 500 Internal Server Error");
    });

    it("should include timestamp in response", async () => {
      const beforeCall = Date.now();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.geminiChatCompletion(
        mockSystemPrompt,
        mockContent
      );

      const afterCall = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(beforeCall);
      expect(result.timestamp).toBeLessThanOrEqual(afterCall);
    });

    it("should handle empty content", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "" } }],
        }),
      });

      const result = await service.geminiChatCompletion(mockSystemPrompt, "");

      expect(result.success).toBe(true);
      expect(result.data).toBe("");
    });

    it("should handle long content", async () => {
      const longContent = "a".repeat(10000);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.geminiChatCompletion(mockSystemPrompt, longContent);

      expect(result.success).toBe(true);
    });

    it("should handle special characters in content", async () => {
      const specialContent = "日本語のテスト 🎌";

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.geminiChatCompletion(
        mockSystemPrompt,
        specialContent
      );

      expect(result.success).toBe(true);
    });
  });
});
