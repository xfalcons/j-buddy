import { LlmUsage } from "../models/types";

export interface StreamConsumptionResult {
  usage?: LlmUsage;
  responseModel?: string;
  finishReason?: string | null;
  completed: boolean;
}

interface StreamEnvelope {
  model?: string;
  usage?: LlmUsage;
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
      const choice = envelope.choices?.[0];
      if (choice?.finish_reason !== undefined) finishReason = choice.finish_reason;
      if (choice?.delta?.content) await onDelta(choice.delta.content);
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
