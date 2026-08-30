import { describe, expect, it, jest } from "@jest/globals";
import { consumeLlmStream } from "../../src/v1/llmStreamDeltas";

function responseFromFrames(frames: string[]) {
  const values = frames.map((frame) => new TextEncoder().encode(frame));
  return {
    body: {
      getReader: () => ({
        read: jest.fn(async () => values.length ?
          { done: false, value: values.shift() } :
          { done: true, value: undefined }),
      }),
    },
  } as unknown as Response;
}

describe("consumeLlmStream", () => {
  it("forwards content while retaining terminal usage and completion metadata", async () => {
    const onDelta = jest.fn();
    const result = await consumeLlmStream(responseFromFrames([
      'data: {"choices":[{"delta":{"content":"日"}}]}\r\n\r\n',
      ': keepalive\r\n\r\n',
      'data: {"model":"gemini-3-flash-preview","usage":{"prompt_tokens":10,\n',
      'data: "completion_tokens":20},"choices":[{"finish_reason":"stop"}]}\r\n\r\n',
      "data: [DONE]\r\n\r\n",
    ]), onDelta as (content: string) => void);

    expect(onDelta).toHaveBeenCalledWith("日");
    expect(result).toEqual({
      usage: { prompt_tokens: 10, completion_tokens: 20 },
      responseModel: "gemini-3-flash-preview",
      finishReason: "stop",
      completed: true,
    });
  });

  it("marks EOF before DONE as incomplete without emitting metadata", async () => {
    const onDelta = jest.fn();
    const result = await consumeLlmStream(responseFromFrames([
      'data: {"choices":[{"delta":{"content":"語"}}]}\n\n',
    ]), onDelta as (content: string) => void);

    expect(onDelta).toHaveBeenCalledWith("語");
    expect(result.completed).toBe(false);
    expect(result.usage).toBeUndefined();
  });
});
