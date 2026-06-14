import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { explainHandler } from "../../src/v1/explainCallable";
import { SYSTEM_PROMPT_V1 } from "../../src/models/systemPromptV1";
import { SYSTEM_PROMPT_V2 } from "../../src/models/systemPromptV2";

// `mock`-prefixed vars are the one exception jest allows inside a mock factory.
// Cast as any: jest.fn() infers `never` under this global jest typing, which
// would reject the mockResolvedValue payload.
const mockChatCompletion = jest.fn() as any;
jest.mock("../../src/services/llmService", () => ({
  createLlmService: () => ({ chatCompletion: mockChatCompletion }),
}));

describe("explainHandler", () => {
  beforeEach(() => {
    mockChatCompletion.mockReset();
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
