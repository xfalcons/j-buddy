import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { BedrockResponsesService } from "../../src/services/bedrockResponsesService";

jest.mock("../../src/config", () => ({
  getConfig: () => ({
      bedrock_response: {
        api_url: "https://bedrock.example",
        api_key: "test-api-key",
        model: "google.gemma-4-31b",
      },
    }),
}));

const mockFetch = jest.fn() as any;
(global as any).fetch = mockFetch;

describe("BedrockResponsesService", () => {
  beforeEach(() => mockFetch.mockClear());

  it("requests an SSE response for streamCompletion", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await new BedrockResponsesService().streamCompletion("system", "日本語");

    const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(payload.stream).toBe(true);
  });
});
