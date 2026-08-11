import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { explainStreamCallableHandler } from "../../src/v1/explainStreamCallableHandler";
import { checkRateLimit } from "../../src/v1/rateLimiter";

const mockStreamCompletion = jest.fn() as any;
const mockCreateLlmService = jest.fn((..._args: unknown[]) => ({ streamCompletion: mockStreamCompletion }));

jest.mock("../../src/services/llmService", () => ({
  createLlmService: (...args: unknown[]) => mockCreateLlmService(...args),
}));

jest.mock("../../src/v1/rateLimiter");

function readableSseResponse(frames: string[]) {
  const values = frames.map((frame) => new TextEncoder().encode(frame));
  return {
    body: {
      getReader: () => ({
        read: jest.fn(async () => values.length
          ? { done: false, value: values.shift() }
          : { done: true, value: undefined }),
      }),
    },
  };
}

describe("explainStreamCallableHandler", () => {
  beforeEach(() => {
    mockStreamCompletion.mockReset();
    mockCreateLlmService.mockClear();
    jest.mocked(checkRateLimit).mockReset();
    jest.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  });

  it("streams analysis deltas and completes the managed-provider analysis", async () => {
    mockStreamCompletion.mockResolvedValue(readableSseResponse([
      'data: {"choices":[{"delta":{"content":"分"}}]}\n',
      'data: {"choices":[{"delta":{"content":"析"}}]}\n',
      "data: [DONE]\n",
    ]));
    const response = { sendChunk: jest.fn(async (_chunk: unknown) => true) };

    const result = await explainStreamCallableHandler(
      {
        data: { content: "テストです" },
        acceptsStreaming: true,
        rawRequest: { ip: "127.0.0.1" },
      } as any,
      response as any
    );

    expect(response.sendChunk).toHaveBeenCalledWith({ content: "分" });
    expect(response.sendChunk).toHaveBeenCalledWith({ content: "析" });
    expect(result).toEqual({ success: true });
  });

  it("rejects a rate-limited request before starting the LLM stream", async () => {
    jest.mocked(checkRateLimit).mockResolvedValue({ allowed: false });

    await expect(explainStreamCallableHandler(
      {
        data: { content: "テストです" },
        acceptsStreaming: true,
        rawRequest: { ip: "127.0.0.1" },
      } as any,
      { sendChunk: jest.fn(async (_chunk: unknown) => true) } as any
    )).rejects.toMatchObject({ code: "resource-exhausted" });

    expect(mockStreamCompletion).not.toHaveBeenCalled();
  });

  it("returns a provider failure as the callable result", async () => {
    mockStreamCompletion.mockRejectedValue(new Error("provider unavailable"));

    const result = await explainStreamCallableHandler(
      {
        data: { content: "テストです" },
        acceptsStreaming: true,
        rawRequest: { ip: "127.0.0.1" },
      } as any,
      { sendChunk: jest.fn(async (_chunk: unknown) => true) } as any
    );

    expect(result).toEqual({ success: false, error: "provider unavailable" });
  });
});
