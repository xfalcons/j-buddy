import { DirectLlmApiService } from '../src/scripts/directLlmApiService.js';

const profile = {
  apiUrl: 'https://provider.example/v1/',
  apiKey: 'private-key-that-must-not-leak',
  model: 'test-model',
};

function headers(contentType = 'text/event-stream') {
  return { get: jest.fn((name) => name === 'content-type' ? contentType : null) };
}

function sseResponse(chunks) {
  const queue = chunks.map((chunk) => new TextEncoder().encode(chunk));
  return {
    ok: true,
    headers: headers(),
    body: {
      getReader: () => ({
        read: jest.fn(async () => queue.length
          ? { done: false, value: queue.shift() }
          : { done: true, value: undefined }),
      }),
    },
  };
}

function jsonResponse(payload) {
  return {
    ok: true,
    headers: headers('application/json; charset=utf-8'),
    json: jest.fn(async () => payload),
  };
}

function errorResponse(status, body) {
  return {
    ok: false,
    status,
    headers: headers('application/json'),
    text: jest.fn(async () => JSON.stringify(body)),
    body: { cancel: jest.fn(async () => undefined) },
  };
}

describe('DirectLlmApiService', () => {
  test('emits OpenAI SSE deltas then exactly one completed result', async () => {
    const fetch = jest.fn(async () => sseResponse([
      'data: {"choices":[{"delta":{"content":"分"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"析"},"finish_reason":null}]}\n\n',
      'data: [DONE]\n\n',
    ]));
    const chunks = [];
    const done = jest.fn();
    const onError = jest.fn();

    await new DirectLlmApiService(fetch).generateResponseStream(
      profile, '日本語', 'v2', undefined,
      (chunk, fullText) => chunks.push([chunk, fullText]), done, onError
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://provider.example/v1/chat/completions');
    expect(fetch.mock.calls[0][1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer private-key-that-must-not-leak' }),
    }));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(expect.objectContaining({
      model: 'test-model', temperature: 0.1, max_tokens: 8192, stream: true,
    }));
    expect(chunks).toEqual([['分', '分'], ['析', '分析']]);
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith('分析');
    expect(onError).not.toHaveBeenCalled();
  });

  test('accepts a complete compatible JSON response without parsing it as SSE', async () => {
    const fetch = jest.fn(async () => jsonResponse({
      choices: [{ message: { content: '完整分析' }, finish_reason: 'stop' }],
    }));
    const onChunk = jest.fn();
    const done = jest.fn();

    await new DirectLlmApiService(fetch).generateResponseStream(
      profile, '日本語', 'v2', undefined, onChunk, done, jest.fn()
    );

    expect(onChunk).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith('完整分析');
  });

  test('retries stream:false once only after an explicit pre-content unsupported-stream refusal', async () => {
    const unsupported = errorResponse(400, { error: { message: 'stream is not supported by this endpoint' } });
    const fetch = jest.fn()
      .mockResolvedValueOnce(unsupported)
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: 'fallback response' }, finish_reason: 'stop' }],
      }));
    const done = jest.fn();

    await new DirectLlmApiService(fetch).generateResponseStream(
      profile, '日本語', 'v2', undefined, jest.fn(), done, jest.fn()
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[0][1].body).stream).toBe(true);
    expect(JSON.parse(fetch.mock.calls[1][1].body).stream).toBe(false);
    expect(done).toHaveBeenCalledWith('fallback response');
  });

  test('does not retry or complete a partial stream that ends without a terminal marker', async () => {
    const fetch = jest.fn(async () => sseResponse([
      'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}\n\n',
    ]));
    const done = jest.fn();
    const onError = jest.fn();

    await new DirectLlmApiService(fetch).generateResponseStream(
      profile, '日本語', 'v2', undefined, jest.fn(), done, onError
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('ended the stream'));
  });

  test('silently aborts a superseded request and forwards its signal to fetch', async () => {
    const controller = new AbortController();
    const fetch = jest.fn((_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }));
    const done = jest.fn();
    const onError = jest.fn();

    const request = new DirectLlmApiService(fetch).generateResponseStream(
      profile, '日本語', 'v2', undefined, jest.fn(), done, onError,
      { signal: controller.signal }
    );
    controller.abort();
    await request;

    expect(fetch.mock.calls[0][1].signal).toBe(controller.signal);
    expect(done).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  test('cancels and releases an open SSE reader when its analysis is superseded', async () => {
    const controller = new AbortController();
    const reader = {
      cancel: jest.fn(async () => undefined),
      releaseLock: jest.fn(),
      read: jest.fn(() => new Promise((resolve, reject) => {
        controller.signal.addEventListener('abort', () => {
          const error = new Error('The operation was aborted.');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      })),
    };
    const fetch = jest.fn(async () => ({
      ok: true,
      headers: headers(),
      body: { getReader: () => reader },
    }));
    const onError = jest.fn();

    const request = new DirectLlmApiService(fetch).generateResponseStream(
      profile, '日本語', 'v2', undefined, jest.fn(), jest.fn(), onError,
      { signal: controller.signal }
    );
    await Promise.resolve();
    controller.abort();
    await request;

    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  test('redacts provider bodies, endpoint details, and keys from errors', async () => {
    const fetch = jest.fn(async () => errorResponse(401, {
      error: { message: `invalid key ${profile.apiKey} at ${profile.apiUrl}` },
    }));
    const onError = jest.fn();

    await new DirectLlmApiService(fetch).generateResponseStream(
      profile, '日本語', 'v2', undefined, jest.fn(), jest.fn(), onError
    );

    const message = onError.mock.calls[0][0];
    expect(message).toContain('HTTP 401');
    expect(message).not.toContain(profile.apiKey);
    expect(message).not.toContain(profile.apiUrl);
  });
});
