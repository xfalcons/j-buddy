import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { explainHandler } from "../../src/v1/explainCallable";
import { checkRateLimit } from "../../src/v1/rateLimiter";
import { SYSTEM_PROMPT_V1 } from "../../src/models/systemPromptV1";
import { SYSTEM_PROMPT_V2 } from "../../src/models/systemPromptV2";

// `mock`-prefixed vars are the one exception jest allows inside a mock factory.
// Cast as any: jest.fn() infers `never` under this global jest typing, which
// would reject the mockResolvedValue payload.
const mockChatCompletion = jest.fn() as any;
const mockCreateLlmService = jest.fn((..._args: unknown[]) => ({ chatCompletion: mockChatCompletion }));
jest.mock("../../src/services/llmService", () => ({
  createLlmService: (...args: unknown[]) => mockCreateLlmService(...args),
}));

jest.mock("../../src/v1/rateLimiter");

describe("explainHandler", () => {
  beforeEach(() => {
    mockChatCompletion.mockReset();
    mockCreateLlmService.mockClear();
    mockChatCompletion.mockResolvedValue({
      success: true,
      data: "mocked analysis",
      timestamp: 0,
    });
    jest.mocked(checkRateLimit).mockReset();
    jest.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  });

  it("defaults to v2 when no prompt is provided", async () => {
    await explainHandler({ data: { content: "テストです" } } as any);

    expect(mockChatCompletion).toHaveBeenCalledWith(SYSTEM_PROMPT_V2, "テストです");
  });

  it.each([undefined, "gemini", "zai"])("always selects Gemini for ai=%s", async (ai) => {
    await explainHandler({ data: { content: "テストです", ...(ai && { ai }) } } as any);

    expect(mockCreateLlmService).toHaveBeenCalledWith("gemini");
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

  it("throws resource-exhausted when the rate limit denies, without calling the LLM", async () => {
    jest.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false });
    await expect(
      explainHandler({ data: { content: "テストです" } } as any)
    ).rejects.toMatchObject({ code: "resource-exhausted" });

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
