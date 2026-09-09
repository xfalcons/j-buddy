import { LlmUsage } from "../models/types";

export interface StreamConsumptionResult {
  usage?: LlmUsage;
  responseModel?: string;
  finishReason?: string | null;
  completed: boolean;
}

interface StreamEnvelope {
  type?: string;
  delta?: string;
  model?: string;
  usage?: LlmUsage;
  response?: {
    model?: string;
    status?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    };
  };
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
}

export async function consumeLlmStream(
  response: Response,
  onDelta: (content: string) => void | Promise<void>
): Promise<StreamConsumptionResult> {
  if (!response.body) {
    throw new Error("No response body from LLM provider");
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let dataLines: string[] = [];
  let latestUsage: LlmUsage | undefined;
  let responseModel: string | undefined;
  let finishReason: string | null | undefined;
  let completed = false;

  const dispatch = async () => {
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n");
    dataLines = [];
    if (data === "[DONE]") {
      completed = true;
      return;
    }

    try {
      const envelope = JSON.parse(data) as StreamEnvelope;
      if (envelope.usage) latestUsage = envelope.usage;
      if (envelope.model) responseModel = envelope.model;
      const response = envelope.response;
      if (response?.model) responseModel = response.model;
      if (response?.usage) {
        latestUsage = {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.total_tokens,
        };
      }
      const choice = envelope.choices?.[0];
      if (choice?.finish_reason !== undefined) finishReason = choice.finish_reason;
      if (choice?.delta?.content) await onDelta(choice.delta.content);
      if (envelope.type === "response.output_text.delta" && envelope.delta) {
        await onDelta(envelope.delta);
      }
      if (envelope.type === "response.completed") {
        completed = true;
        finishReason = response?.status === "completed" ? "stop" : response?.status;
      }
    } catch {
      // Malformed provider frames are ignored; terminal completion remains false.
    }
  };

  const consumeLine = async (line: string) => {
    if (line === "") {
      await dispatch();
      return;
    }
    if (line.startsWith(":")) return;
    if (line.startsWith("data:")) {
      const data = line.slice(5).replace(/^ /, "");
      if (data === "[DONE]") {
        await dispatch();
        completed = true;
        return;
      }
      if (dataLines.length > 0 && data.startsWith("{")) {
        await dispatch();
      }
      dataLines.push(data);
    }
  };

  const consumeBufferLines = async () => {
    let lineEnd = findLineEnd(buffer);
    while (lineEnd) {
      const line = buffer.slice(0, lineEnd.index);
      buffer = buffer.slice(lineEnd.nextIndex);
      await consumeLine(line);
      lineEnd = findLineEnd(buffer);
    }
  };

  // eslint-disable-next-line no-constant-condition -- reader termination controls the loop
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    await consumeBufferLines();
  }

  buffer += decoder.decode();
  await consumeBufferLines();

  return {
    ...(completed && latestUsage ? { usage: latestUsage } : {}),
    ...(responseModel ? { responseModel } : {}),
    ...(finishReason !== undefined ? { finishReason } : {}),
    completed,
  };
}

function findLineEnd(value: string): { index: number; nextIndex: number } | undefined {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\n") return { index, nextIndex: index + 1 };
    if (value[index] === "\r") {
      if (index === value.length - 1) return undefined;
      return { index, nextIndex: value[index + 1] === "\n" ? index + 2 : index + 1 };
    }
  }
  return undefined;
}
