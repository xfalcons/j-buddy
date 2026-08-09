import { buildDirectCompletionRequest } from './directAnalysisContract.js';

const UNSUPPORTED_STREAMING = /\bstream(?:ing)?\b[\s\S]{0,80}\b(?:not supported|unsupported|not allowed|invalid|unknown)\b|\b(?:not supported|unsupported)\b[\s\S]{0,80}\bstream(?:ing)?\b/i;

export class DirectLlmApiError extends Error {
  constructor(message, code = 'personal_provider_request_failed', status = null) {
    super(message);
    this.name = 'DirectLlmApiError';
    this.code = code;
    this.status = status;
  }
}

export function buildChatCompletionsUrl(apiUrl) {
  return `${String(apiUrl).replace(/\/+$/, '')}/chat/completions`;
}

function errorDetailFromBody(body) {
  if (!body || typeof body !== 'object') return '';
  if (typeof body.error === 'string') return body.error;
  if (typeof body.error?.message === 'string') return body.error.message;
  if (typeof body.message === 'string') return body.message;
  if (typeof body.detail === 'string') return body.detail;
  return '';
}

async function readResponseBody(response) {
  try {
    const text = await response.text();
    if (!text) return { text: '', json: null };
    try {
      return { text, json: JSON.parse(text) };
    } catch {
      return { text, json: null };
    }
  } catch {
    return { text: '', json: null };
  }
}

function responseError(response, body) {
  const status = Number.isInteger(response?.status) ? response.status : null;
  const detail = errorDetailFromBody(body.json) || body.text;
  const isUnsupportedStream = status >= 400 && status < 500 && UNSUPPORTED_STREAMING.test(detail);
  return new DirectLlmApiError(
    isUnsupportedStream
      ? '此提供者不支援串流回應。'
      : `個人提供者無法完成此要求${status ? `（HTTP ${status}）` : ''}。請檢查設定後再試一次。`,
    isUnsupportedStream ? 'streaming_unsupported' : 'personal_provider_http_error',
    status
  );
}

async function cancelResponse(response) {
  try {
    await response?.body?.cancel?.();
  } catch {
    // The body may already be consumed. Nothing else is required before retry.
  }
}

function isAbortError(error, signal) {
  return Boolean(signal?.aborted || error?.name === 'AbortError');
}

function hasTerminalFinishReason(payload) {
  const finishReason = payload?.choices?.[0]?.finish_reason;
  return finishReason !== null && finishReason !== undefined;
}

function completeResponseContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !hasTerminalFinishReason(payload)) {
    throw new DirectLlmApiError(
      '個人提供者回傳了不支援的回應格式。',
      'personal_provider_invalid_response'
    );
  }
  return content;
}

function sseFrameData(frame) {
  return frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
}

function parseSsePayload(data) {
  try {
    return JSON.parse(data);
  } catch {
    throw new DirectLlmApiError(
      '個人提供者回傳了不支援的串流回應。',
      'personal_provider_invalid_response'
    );
  }
}

async function consumeOpenAiSse(response, onChunk, signal) {
  if (!response.body?.getReader) {
    throw new DirectLlmApiError(
      '個人提供者未回傳可讀取的串流回應。',
      'personal_provider_invalid_response'
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let terminal = false;
  const cancelReader = () => {
    // `fetch` cancellation normally stops the body too, but explicitly
    // cancelling the reader releases an already-open stream immediately.
    Promise.resolve(reader.cancel?.()).catch(() => {});
  };
  signal?.addEventListener?.('abort', cancelReader, { once: true });

  const consumeFrame = (frame) => {
    const data = sseFrameData(frame);
    if (!data || data === '[DONE]') {
      if (data === '[DONE]') terminal = true;
      return;
    }

    const payload = parseSsePayload(data);
    if (payload?.error) {
      throw new DirectLlmApiError(
        '個人提供者在串流分析時回傳錯誤。',
        'personal_provider_stream_error'
      );
    }
    const delta = payload?.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta) {
      fullText += delta;
      onChunk(delta, fullText);
    }
    if (hasTerminalFinishReason(payload)) terminal = true;
  };

  try {
    if (signal?.aborted) {
      cancelReader();
      const error = new Error('The analysis was aborted.');
      error.name = 'AbortError';
      throw error;
    }
    while (!terminal) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || '';
      for (const frame of frames) {
        consumeFrame(frame);
        if (terminal) break;
      }
    }

    if (!terminal && buffer) consumeFrame(buffer);
    if (!terminal) {
      throw new DirectLlmApiError(
        '個人提供者在完成分析前中斷了串流。',
        'personal_provider_incomplete_stream'
      );
    }
    return fullText;
  } finally {
    signal?.removeEventListener?.('abort', cancelReader);
    if (!terminal && !signal?.aborted) cancelReader();
    reader.releaseLock?.();
  }
}

function responseIsJson(response) {
  return /application\/json/i.test(response?.headers?.get?.('content-type') || '');
}

/**
 * Direct OpenAI-compatible transport. It never sends provider credentials to
 * Firebase, never logs request metadata, and never falls back to managed mode.
 */
export class DirectLlmApiService {
  constructor(fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== 'function') {
      throw new DirectLlmApiError('此擴充功能環境無法使用網路請求。', 'fetch_unavailable');
    }
    // Window.fetch is receiver-sensitive in Chromium. Keep the injected
    // transport testable while always invoking it with the extension global.
    this.fetch = (...args) => fetchImpl.call(globalThis, ...args);
  }

  async request(profile, selectedText, promptVariant, context, stream, signal) {
    let response;
    try {
      response = await this.fetch(buildChatCompletionsUrl(profile.apiUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${profile.apiKey}`,
        },
        body: JSON.stringify(buildDirectCompletionRequest({
          profile,
          selectedText,
          promptVariant,
          context,
          stream,
        })),
        signal,
      });
    } catch (error) {
      if (isAbortError(error, signal)) throw error;
      throw new DirectLlmApiError(
        '無法連線至個人提供者。請檢查網址、權限與網路連線。',
        'personal_provider_network_error'
      );
    }

    if (!response?.ok) {
      const body = await readResponseBody(response);
      const error = responseError(response, body);
      error.response = response;
      throw error;
    }
    return response;
  }

  /**
   * Match the existing side-panel callback contract. Errors are deliberately
   * redacted and a partial personal stream is never promoted to `onDone`.
   */
  async generateResponseStream(profile, selectedText, promptVariant, context, onChunk, onDone, onError, { signal } = {}) {
    try {
      let response;
      try {
        response = await this.request(profile, selectedText, promptVariant, context, true, signal);
      } catch (error) {
        if (error?.code !== 'streaming_unsupported') throw error;
        // A provider only gets a stream:false retry after a clear 4xx rejection
        // before content. We never retry an ambiguous/partial stream.
        await cancelResponse(error.response);
        response = await this.request(profile, selectedText, promptVariant, context, false, signal);
      }

      const fullText = responseIsJson(response)
        ? completeResponseContent(await response.json())
        : await consumeOpenAiSse(response, onChunk, signal);
      if (signal?.aborted) return null;
      onDone(fullText);
      return fullText;
    } catch (error) {
      // Superseded analysis is expected control flow. It must neither show a
      // provider error nor turn a partial response into a completed result.
      if (isAbortError(error, signal)) return null;
      const message = error instanceof DirectLlmApiError
        ? error.message
        : '個人提供者無法完成此要求。請檢查設定後再試一次。';
      onError(message);
      return null;
    }
  }
}

export { completeResponseContent, consumeOpenAiSse, isAbortError };
