import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ZaiLlmService } from "../../src/services/zaiLlmService";

jest.mock("../../src/config", () => ({
  configSecret: {
    value: () => ({
      gemini: { api_url: "https://gemini.example", api_key: "gemini-key", model: "gemini-3-flash-preview" },
      zai: { api_url: "https://zai.example", api_key: "zai-key", model: "GLM-5.3-Flash" },
    }),
  },
  LLM_PROVIDER: "zai",
}));

const mockFetch = jest.fn() as any;
(global as any).fetch = mockFetch;

describe("ZaiLlmService", () => {
  let service: ZaiLlmService;

  beforeEach(() => {
    mockFetch.mockClear();
    service = new ZaiLlmService();
  });

  it("retains batch usage beside the callable response", async () => {
    const usage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "GLM-5.3-Flash",
        usage,
        choices: [{ finish_reason: "stop", message: { role: "assistant", content: "answer" } }],
      }),
    });

    const result = await service.chatCompletion("system", "content");

    expect(result.response.data).toBe("answer");
    expect(result.usage).toEqual(usage);
    expect(result.responseModel).toBe("GLM-5.3-Flash");
    expect(result.finishReason).toBe("stop");
  });

  it("keeps Z.AI streams free of Gemini-only usage options", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await service.streamCompletion("system", "content");

    const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(payload).toEqual(expect.objectContaining({ stream: true }));
    expect(payload.stream_options).toBeUndefined();
  });
});
