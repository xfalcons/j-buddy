/** Yield content deltas from an OpenAI-compatible LLM SSE response. */
export async function* streamLlmDeltas(response: Response): AsyncGenerator<string> {
  if (!response.body) {
    throw new Error("No response body from LLM provider");
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";

  const parseLine = (line: string): string | undefined => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(":")) return undefined;
    if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]") return undefined;

    try {
      return JSON.parse(trimmed.slice(6)).choices?.[0]?.delta?.content;
    } catch {
      return undefined;
    }
  };

  // eslint-disable-next-line no-constant-condition -- intentional streaming loop, broken by `done`
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const content = parseLine(line);
      if (content) yield content;
    }
  }

  const content = parseLine(buffer + decoder.decode());
  if (content) yield content;
}
