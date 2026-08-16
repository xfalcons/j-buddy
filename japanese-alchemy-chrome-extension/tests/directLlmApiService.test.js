import { DirectLlmApiService, buildModelsUrl } from '../src/scripts/directLlmApiService.js';

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

function sseResponseBytes(chunks) {
  const queue = [...chunks];
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
  test('loads unique non-empty model IDs from the configured OpenAI-compatible base URL', async () => {
    const fetch = jest.fn(async () => jsonResponse({
      data: [{ id: 'model-b' }, { id: 'model-a' }, { id: 'model-b' }, { id: '  ' }, {}],
    }));

    await expect(new DirectLlmApiService(fetch).loadModels({
      apiUrl: profile.apiUrl,
      apiKey: profile.apiKey,
    })).resolves.toEqual(['model-b', 'model-a']);

    expect(buildModelsUrl(profile.apiUrl)).toBe('https://provider.example/v1/models');
    expect(fetch).toHaveBeenCalledWith('https://provider.example/v1/models', expect.objectContaining({
      method: 'GET',
      headers: { Authorization: 'Bearer private-key-that-must-not-leak' },
    }));
  });

  test('rejects an empty or incompatible model catalog without exposing provider details', async () => {
    const fetch = jest.fn(async () => jsonResponse({ data: [] }));

    await expect(new DirectLlmApiService(fetch).loadModels({
      apiUrl: profile.apiUrl,
      apiKey: profile.apiKey,
    })).rejects.toMatchObject({ code: 'personal_provider_invalid_model_catalog' });
  });

  test('forwards abort signals while loading models', async () => {
    const controller = new AbortController();
    const fetch = jest.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('The request was aborted.');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }));

    const request = new DirectLlmApiService(fetch).loadModels({
      apiUrl: profile.apiUrl,
      apiKey: profile.apiKey,
    }, { signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch.mock.calls[0][1].signal).toBe(controller.signal);
  });

  test('calls a receiver-sensitive fetch implementation with the extension global', async () => {
    const fetch = jest.fn(function receiverSensitiveFetch() {
      if (this !== globalThis) {
        throw new TypeError('fetch requires the extension global receiver');
      }
      return jsonResponse({
        choices: [{ message: { content: 'bound response' }, finish_reason: 'stop' }],
      });
    });
    const done = jest.fn();
    const onError = jest.fn();

    await new DirectLlmApiService(fetch).generateResponseStream(
      profile, '日本語', 'v2', undefined, jest.fn(), done, onError
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith('bound response');
    expect(onError).not.toHaveBeenCalled();
  });

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

  test('reassembles fragmented CRLF SSE frames, [DONE], and split UTF-8 content', async () => {
    const encoder = new TextEncoder();
    const utf8Character = encoder.encode('語');
    const fetch = jest.fn(async () => sseResponseBytes([
      encoder.encode('data: {"choices":[{"delta":{"content":"'),
      utf8Character.slice(0, 1),
      utf8Character.slice(1),
      encoder.encode('"},"finish_reason":null}]}\r'),
      encoder.encode('\n\r'),
      encoder.encode('\ndata: [DO'),
      encoder.encode('NE]\r\n\r\n'),
    ]));
    const chunks = [];
    const done = jest.fn();
    const onError = jest.fn();

    await new DirectLlmApiService(fetch).generateResponseStream(
      profile, '日本語', 'v2', undefined,
      (chunk, fullText) => chunks.push([chunk, fullText]), done, onError
    );

    expect(chunks).toEqual([['語', '語']]);
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith('語');
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
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('中斷了串流'));
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
