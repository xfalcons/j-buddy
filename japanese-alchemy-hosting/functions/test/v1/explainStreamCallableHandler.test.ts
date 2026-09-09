import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { explainStreamCallableHandler } from "../../src/v1/explainStreamCallableHandler";

const mockStreamCompletion = jest.fn() as any;
const mockCreateLlmService = jest.fn((..._args: unknown[]) => ({ streamCompletion: mockStreamCompletion }));
const mockDailyAllowanceConfig = { enabled: false } as any;

jest.mock("../../src/services/llmService", () => ({
  createLlmService: (...args: unknown[]) => mockCreateLlmService(...args),
}));
jest.mock("../../src/config", () => ({
  getDailyAllowanceConfig: () => mockDailyAllowanceConfig,
}));
jest.mock("../../src/v1/dailyAllowance", () => ({
  ...(jest.requireActual("../../src/v1/dailyAllowance") as object),
  admitDailyAllowance: (...args: unknown[]) => mockAdmitDailyAllowance(...args),
}));

const mockAdmitDailyAllowance = jest.fn() as any;


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
    mockDailyAllowanceConfig.enabled = false;
    mockAdmitDailyAllowance.mockReset();
    mockStreamCompletion.mockReset();
    mockCreateLlmService.mockClear();
  });

  it("streams analysis deltas and completes the managed-provider analysis", async () => {
    mockStreamCompletion.mockResolvedValue({ response: readableSseResponse([
      'data: {"choices":[{"delta":{"content":"分"}}]}\n',
      'data: {"choices":[{"delta":{"content":"析"}}]}\n',
      "data: [DONE]\n",
    ]), requestedModel: "gemini-3-flash-preview" });
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
    expect(result).toEqual({ success: true, allowance: undefined });
  });

  it("admits managed-provider analysis and returns allowance metadata", async () => {
    mockDailyAllowanceConfig.enabled = true;
    mockDailyAllowanceConfig.activeHmacKey = "active-key";
    mockAdmitDailyAllowance.mockResolvedValue({
      allowed: true,
      limit: 20,
      remaining: 12,
      resetAt: "2026-09-10T00:00:00.000Z",
    });
    mockStreamCompletion.mockResolvedValue({
      response: readableSseResponse(["data: [DONE]\n"]),
    });

    const result = await explainStreamCallableHandler(
      {
        data: { content: "テストです" },
        acceptsStreaming: true,
        auth: { uid: "user-1" },
        rawRequest: { ip: "203.0.113.10" },
      } as any,
      { sendChunk: jest.fn(async (_chunk: unknown) => true) } as any
    );

    expect(mockAdmitDailyAllowance).toHaveBeenCalledWith(expect.objectContaining({
      uid: "user-1",
      ip: "203.0.113.10",
      activeHmacKey: "active-key",
      endpoint: "explainStreamCallable",
    }));
    expect(result.allowance).toEqual({
      limit: 20,
      remaining: 12,
      resetAt: "2026-09-10T00:00:00.000Z",
    });
  });

  it("throws typed exhaustion details before model work", async () => {
    mockDailyAllowanceConfig.enabled = true;
    mockAdmitDailyAllowance.mockResolvedValue({
      allowed: false,
      reason: "daily_allowance_exhausted",
      limit: 20,
      resetAt: "2026-09-10T00:00:00.000Z",
    });

    await expect(explainStreamCallableHandler(
      { data: { content: "テストです" }, rawRequest: { ip: "127.0.0.1" } } as any
    )).rejects.toMatchObject({
      code: "resource-exhausted",
      details: { reason: "daily_allowance_exhausted", limit: 20 },
    });
    expect(mockStreamCompletion).not.toHaveBeenCalled();
  });

  it("reports an enforcement outage without allowance data", async () => {
    mockDailyAllowanceConfig.enabled = true;
    mockAdmitDailyAllowance.mockResolvedValue({
      allowed: false,
      reason: "unavailable",
    });

    await expect(explainStreamCallableHandler(
      { data: { content: "テストです" }, rawRequest: { ip: "127.0.0.1" } } as any
    )).rejects.toMatchObject({
      code: "unavailable",
      details: { reason: "unavailable" },
    });
  });

  it("reports consumed allowance metadata when admitted stream work fails", async () => {
    mockDailyAllowanceConfig.enabled = true;
    mockAdmitDailyAllowance.mockResolvedValue({
      allowed: true,
      limit: 20,
      remaining: 7,
      resetAt: "2026-09-10T00:00:00.000Z",
    });
    mockStreamCompletion.mockRejectedValue(new Error("provider unavailable"));

    const result = await explainStreamCallableHandler(
      { data: { content: "テストです" }, rawRequest: { ip: "127.0.0.1" } } as any
    );

    expect(result).toEqual({
      success: false,
      error: "provider unavailable",
      allowance: {
        limit: 20,
        remaining: 7,
        resetAt: "2026-09-10T00:00:00.000Z",
      },
    });
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

    expect(result).toEqual({
      success: false,
      error: "provider unavailable",
      allowance: undefined,
    });
  });
});
