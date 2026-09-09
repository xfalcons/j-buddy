import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { explainHandler } from "../../src/v1/explainCallable";
import { SYSTEM_PROMPT_V1 } from "../../src/models/systemPromptV1";
import { SYSTEM_PROMPT_V2 } from "../../src/models/systemPromptV2";

// `mock`-prefixed vars are the one exception jest allows inside a mock factory.
// Cast as any: jest.fn() infers `never` under this global jest typing, which
// would reject the mockResolvedValue payload.
const mockChatCompletion = jest.fn() as any;
const mockCreateLlmService = jest.fn((..._args: unknown[]) => ({ chatCompletion: mockChatCompletion }));
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


describe("explainHandler", () => {
  beforeEach(() => {
    mockDailyAllowanceConfig.enabled = false;
    mockAdmitDailyAllowance.mockReset();
    mockChatCompletion.mockReset();
    mockCreateLlmService.mockClear();
    mockChatCompletion.mockResolvedValue({
      success: true,
      data: "mocked analysis",
      timestamp: 0,
    });
  });

  it("defaults to v2 when no prompt is provided", async () => {
    await explainHandler({ data: { content: "テストです" } } as any);

    expect(mockChatCompletion).toHaveBeenCalledWith(SYSTEM_PROMPT_V2, "テストです");
  });

  it("uses the ai parameter when provided", async () => {
    await explainHandler({ data: { content: "テストです", ai: "gemini" } } as any);
    expect(mockCreateLlmService).toHaveBeenCalledWith("gemini");

    await explainHandler({ data: { content: "テストです", ai: "zai" } } as any);
    expect(mockCreateLlmService).toHaveBeenCalledWith("zai");
  });

  it("uses the chain when ai is not provided", async () => {
    await explainHandler({ data: { content: "テストです" } } as any);
    expect(mockCreateLlmService).toHaveBeenCalledWith(undefined);
  });

  it("admits managed-provider analysis and returns allowance status", async () => {
    mockDailyAllowanceConfig.enabled = true;
    mockDailyAllowanceConfig.activeHmacKey = "active-key";
    mockAdmitDailyAllowance.mockResolvedValue({
      allowed: true,
      limit: 20,
      remaining: 19,
      resetAt: "2026-09-10T00:00:00.000Z",
    });

    const result = await explainHandler({
      data: { content: "テストです" },
      auth: { uid: "user-1" },
      rawRequest: { ip: "203.0.113.10" },
    } as any);

    expect(mockAdmitDailyAllowance).toHaveBeenCalledWith(expect.objectContaining({
      uid: "user-1",
      ip: "203.0.113.10",
      activeHmacKey: "active-key",
      endpoint: "explain",
    }));
    expect(result.allowance).toEqual({
      limit: 20,
      remaining: 19,
      resetAt: "2026-09-10T00:00:00.000Z",
    });
  });

  it("throws typed exhaustion details without starting model work", async () => {
    mockDailyAllowanceConfig.enabled = true;
    mockAdmitDailyAllowance.mockResolvedValue({
      allowed: false,
      reason: "daily_allowance_exhausted",
      limit: 20,
      resetAt: "2026-09-10T00:00:00.000Z",
    });

    await expect(explainHandler({ data: { content: "テストです" } } as any))
      .rejects.toMatchObject({
        code: "resource-exhausted",
        details: {
          reason: "daily_allowance_exhausted",
          limit: 20,
          resetAt: "2026-09-10T00:00:00.000Z",
        },
      });
    expect(mockChatCompletion).not.toHaveBeenCalled();
  });

  it("reports an enforcement outage without allowance data", async () => {
    mockDailyAllowanceConfig.enabled = true;
    mockAdmitDailyAllowance.mockResolvedValue({
      allowed: false,
      reason: "unavailable",
    });

    await expect(explainHandler({ data: { content: "テストです" } } as any))
      .rejects.toMatchObject({
        code: "unavailable",
        details: { reason: "unavailable" },
    });
  });

  it("reports consumed allowance metadata when admitted model work fails", async () => {
    mockDailyAllowanceConfig.enabled = true;
    mockAdmitDailyAllowance.mockResolvedValue({
      allowed: true,
      limit: 20,
      remaining: 7,
      resetAt: "2026-09-10T00:00:00.000Z",
    });
    mockChatCompletion.mockRejectedValue(new Error("provider unavailable"));

    await expect(explainHandler({ data: { content: "テストです" } } as any))
      .rejects.toMatchObject({
        code: "internal",
        details: {
          allowance: {
            limit: 20,
            remaining: 7,
            resetAt: "2026-09-10T00:00:00.000Z",
          },
          consumedAllowance: true,
        },
      });
  });

  it("selects v1 when prompt is v1", async () => {
    await explainHandler({ data: { content: "テストです", prompt: "v1" } } as any);

    expect(mockChatCompletion).toHaveBeenCalledWith(SYSTEM_PROMPT_V1, "テストです");
  });

  it("rejects an invalid prompt version without calling the LLM", async () => {
    await expect(
      explainHandler({ data: { content: "テストです", prompt: "v3" } } as any)
    ).rejects.toThrow();

    expect(mockChatCompletion).not.toHaveBeenCalled();
  });

  it("rejects missing content without calling the LLM", async () => {
    await expect(
      explainHandler({ data: {} } as any)
    ).rejects.toThrow();

    expect(mockChatCompletion).not.toHaveBeenCalled();
  });

  it("rejects oversized content without calling the LLM (parity with stream)", async () => {
    await expect(
      explainHandler({ data: { content: "あ".repeat(501) } } as any)
    ).rejects.toThrow();

    expect(mockChatCompletion).not.toHaveBeenCalled();
  });

  it("wraps the user message with context blocks when context is provided", async () => {
    await explainHandler({
      data: {
        content: "テストです",
        prompt: "v2",
        context_before: "前文",
        context_after: "後文",
      },
    } as any);

    expect(mockChatCompletion).toHaveBeenCalledTimes(1);
    const [, message] = mockChatCompletion.mock.calls[0];
    expect(message).toContain("【前文】前文");
    expect(message).toContain("【分析対象】テストです");
    expect(message).toContain("【後文】後文");
  });
});
