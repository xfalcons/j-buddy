import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { explainStreamHandler } from "../../src/v1/explainStreamHandler";
import { SYSTEM_PROMPT_V1 } from "../../src/models/systemPromptV1";
import { SYSTEM_PROMPT_V2 } from "../../src/models/systemPromptV2";

const mockStreamCompletion = jest.fn() as any;
jest.mock("../../src/services/llmService", () => ({
  createLlmService: () => ({ streamCompletion: mockStreamCompletion }),
}));

function mockRes() {
  const res: any = {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    write: jest.fn(),
    end: jest.fn(),
  };
  return res;
}

// Minimal mock request with a header() function (isBodyTooLarge reads Content-Length).
function mockReq(body: any, contentLength?: number) {
  return {
    body,
    header: (name: string) =>
      name === "content-length" && contentLength != null
        ? String(contentLength)
        : undefined,
  } as any;
}

describe("explainStreamHandler", () => {
  beforeEach(() => {
    mockStreamCompletion.mockReset();
    // A response body that immediately signals "done" so the handler completes.
    const reader = {
      read: (jest.fn() as any).mockResolvedValue({ done: true, value: undefined }),
    };
    mockStreamCompletion.mockResolvedValue({
      body: { getReader: () => reader },
    });
  });

  it("defaults to v2 when no prompt is provided", async () => {
    await explainStreamHandler(mockReq({ content: "テストです" }), mockRes());

    expect(mockStreamCompletion).toHaveBeenCalledWith(SYSTEM_PROMPT_V2, "テストです");
  });

  it("selects v1 when prompt is v1", async () => {
    await explainStreamHandler(
      mockReq({ content: "テストです", prompt: "v1" }),
      mockRes()
    );

    expect(mockStreamCompletion).toHaveBeenCalledWith(SYSTEM_PROMPT_V1, "テストです");
  });

  it("rejects missing content with 400 before calling the LLM", async () => {
    const res = mockRes();
    await explainStreamHandler(mockReq({}), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockStreamCompletion).not.toHaveBeenCalled();
  });

  it("rejects an invalid prompt version with 400 before calling the LLM", async () => {
    const res = mockRes();
    await explainStreamHandler(mockReq({ content: "テストです", prompt: "v3" }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockStreamCompletion).not.toHaveBeenCalled();
  });

  it("rejects oversized content with 400 before calling the LLM", async () => {
    const res = mockRes();
    await explainStreamHandler(mockReq({ content: "あ".repeat(501) }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockStreamCompletion).not.toHaveBeenCalled();
  });

  it("rejects an oversized body with 413 before calling the LLM", async () => {
    const res = mockRes();
    await explainStreamHandler(mockReq({ content: "テストです" }, 16 * 1024 + 1), res);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(mockStreamCompletion).not.toHaveBeenCalled();
  });

  it("wraps the user message with context blocks when context is provided", async () => {
    await explainStreamHandler(
      mockReq({
        content: "テストです",
        prompt: "v2",
        context_before: "前文",
        context_after: "後文",
      }),
      mockRes()
    );

    expect(mockStreamCompletion).toHaveBeenCalledTimes(1);
    const [, message] = mockStreamCompletion.mock.calls[0];
    expect(message).toContain("【前文】前文");
    expect(message).toContain("【分析対象】テストです");
    expect(message).toContain("【後文】後文");
  });

  it("omits the after block when only context_before is present", async () => {
    await explainStreamHandler(
      mockReq({ content: "テストです", context_before: "前文" }),
      mockRes()
    );

    const [, message] = mockStreamCompletion.mock.calls[0];
    expect(message).toContain("【前文】前文");
    expect(message).toContain("【分析対象】テストです");
    expect(message).not.toContain("【後文】");
  });
});
