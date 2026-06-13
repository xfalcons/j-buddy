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
    await explainStreamHandler({ body: { content: "テストです" } } as any, mockRes());

    expect(mockStreamCompletion).toHaveBeenCalledWith(SYSTEM_PROMPT_V2, "テストです");
  });

  it("selects v1 when prompt is v1", async () => {
    await explainStreamHandler(
      { body: { content: "テストです", prompt: "v1" } } as any,
      mockRes()
    );

    expect(mockStreamCompletion).toHaveBeenCalledWith(SYSTEM_PROMPT_V1, "テストです");
  });

  it("rejects missing content with 400 before calling the LLM", async () => {
    const res = mockRes();
    await explainStreamHandler({ body: {} } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockStreamCompletion).not.toHaveBeenCalled();
  });

  it("rejects an invalid prompt version with 400 before calling the LLM", async () => {
    const res = mockRes();
    await explainStreamHandler(
      { body: { content: "テストです", prompt: "v3" } } as any,
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockStreamCompletion).not.toHaveBeenCalled();
  });
});
