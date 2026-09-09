const mockInitializeApp = jest.fn();
const mockGetFunctions = jest.fn();
const mockConnectFunctionsEmulator = jest.fn();
const mockHttpsCallable = jest.fn();

jest.mock('firebase/app', () => ({
  initializeApp: (...args) => mockInitializeApp(...args),
}));

jest.mock('firebase/functions', () => ({
  getFunctions: (...args) => mockGetFunctions(...args),
  connectFunctionsEmulator: (...args) => mockConnectFunctionsEmulator(...args),
  httpsCallable: (...args) => mockHttpsCallable(...args),
}));

import '../src/scripts/jaAlchemyApiService.js';

describe('JaAlchemyApiService', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    delete window.firebaseApp;
    mockInitializeApp.mockReset();
    mockGetFunctions.mockReset();
    mockConnectFunctionsEmulator.mockReset();
    mockHttpsCallable.mockReset();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('connects development builds to the Functions emulator before callable use', () => {
    const functions = {};
    process.env.NODE_ENV = 'development';
    mockInitializeApp.mockReturnValue({});
    mockGetFunctions.mockReturnValue(functions);

    new window.JaAlchemyApiService();

    expect(mockConnectFunctionsEmulator).toHaveBeenCalledWith(functions, '127.0.0.1', 5001);
  });

  test('keeps production builds connected to deployed Functions', () => {
    process.env.NODE_ENV = 'production';
    mockInitializeApp.mockReturnValue({});
    mockGetFunctions.mockReturnValue({});

    new window.JaAlchemyApiService();

    expect(mockConnectFunctionsEmulator).not.toHaveBeenCalled();
  });

  test('renders callable stream chunks before completing managed-provider analysis', async () => {
    const functions = {};
    const callable = jest.fn();
    const controller = new AbortController();
    callable.stream = jest.fn(async () => ({
      stream: {
        async *[Symbol.asyncIterator]() {
          yield { content: '分' };
          yield { content: '析' };
        },
      },
      data: Promise.resolve({
        success: true,
        allowance: { limit: 20, remaining: 12, resetAt: '2026-09-10T00:00:00.000Z' },
      }),
    }));
    mockInitializeApp.mockReturnValue({});
    mockGetFunctions.mockReturnValue(functions);
    mockHttpsCallable.mockReturnValue(callable);
    const onChunk = jest.fn();
    const onDone = jest.fn();
    const onError = jest.fn();

    await new window.JaAlchemyApiService().generateResponseStream(
      'テストです', 'v2', undefined, onChunk, onDone, onError, { signal: controller.signal }
    );

    expect(mockHttpsCallable).toHaveBeenCalledWith(functions, 'explainStreamCallable');
    expect(callable.stream).toHaveBeenCalledWith(
      { content: 'テストです', prompt: 'v2' },
      { signal: controller.signal }
    );
    expect(onChunk).toHaveBeenNthCalledWith(1, '分', '分');
    expect(onChunk).toHaveBeenNthCalledWith(2, '析', '分析');
    expect(onDone).toHaveBeenCalledWith('分析', {
      limit: 20,
      remaining: 12,
      resetAt: '2026-09-10T00:00:00.000Z',
    });
    expect(onError).not.toHaveBeenCalled();
  });

  test('silently stops a managed stream cancelled before its first chunk', async () => {
    const controller = new AbortController();
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const callable = jest.fn();
    callable.stream = jest.fn(async () => ({
      stream: {
        async *[Symbol.asyncIterator]() {
          controller.abort();
          throw abortError;
        },
      },
      data: Promise.reject(abortError),
    }));
    mockInitializeApp.mockReturnValue({});
    mockGetFunctions.mockReturnValue({});
    mockHttpsCallable.mockReturnValue(callable);
    const onDone = jest.fn();
    const onError = jest.fn();

    await new window.JaAlchemyApiService().generateResponseStream(
      'テストです', 'v2', undefined, jest.fn(), onDone, onError, { signal: controller.signal }
    );

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  test('does not finalize partial managed text after cancellation', async () => {
    const controller = new AbortController();
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const callable = jest.fn();
    callable.stream = jest.fn(async () => ({
      stream: {
        async *[Symbol.asyncIterator]() {
          yield { content: '分' };
          controller.abort();
          throw abortError;
        },
      },
      data: Promise.reject(abortError),
    }));
    mockInitializeApp.mockReturnValue({});
    mockGetFunctions.mockReturnValue({});
    mockHttpsCallable.mockReturnValue(callable);
    const onChunk = jest.fn();
    const onDone = jest.fn();
    const onError = jest.fn();

    await new window.JaAlchemyApiService().generateResponseStream(
      'テストです', 'v2', undefined, onChunk, onDone, onError, { signal: controller.signal }
    );

    expect(onChunk).toHaveBeenCalledWith('分', '分');
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  test('reports a callable failure before managed-provider content arrives', async () => {
    const callable = jest.fn();
    callable.stream = jest.fn(async () => ({
      stream: {
        async *[Symbol.asyncIterator]() {},
      },
      data: Promise.resolve({ success: false, error: 'rate limited' }),
    }));
    mockInitializeApp.mockReturnValue({});
    mockGetFunctions.mockReturnValue({});
    mockHttpsCallable.mockReturnValue(callable);
    const onDone = jest.fn();
    const onError = jest.fn();

    await new window.JaAlchemyApiService().generateResponseStream(
      'テストです', 'v2', undefined, jest.fn(), onDone, onError
    );

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('rate limited', {
      type: 'admitted_analysis_failure',
      allowance: undefined,
    });
  });

  test('reports a provider failure after partial content without finalizing analysis', async () => {
    const callable = jest.fn();
    callable.stream = jest.fn(async () => ({
      stream: {
        async *[Symbol.asyncIterator]() {
          yield { content: '分' };
        },
      },
      data: Promise.resolve({
        success: false,
        error: 'provider unavailable',
        allowance: { limit: 20, remaining: 3, resetAt: '2026-09-10T00:00:00.000Z' },
      }),
    }));
    mockInitializeApp.mockReturnValue({});
    mockGetFunctions.mockReturnValue({});
    mockHttpsCallable.mockReturnValue(callable);
    const onChunk = jest.fn();
    const onDone = jest.fn();
    const onError = jest.fn();

    await new window.JaAlchemyApiService().generateResponseStream(
      'テストです', 'v2', undefined, onChunk, onDone, onError
    );

    expect(onChunk).toHaveBeenCalledWith('分', '分');
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('provider unavailable', {
      type: 'admitted_analysis_failure',
      allowance: { limit: 20, remaining: 3, resetAt: '2026-09-10T00:00:00.000Z' },
    });
  });

  test('reports a transport failure after partial content without finalizing analysis', async () => {
    const transportError = new Error('network disconnected');
    const callable = jest.fn();
    callable.stream = jest.fn(async () => ({
      stream: {
        async *[Symbol.asyncIterator]() {
          yield { content: '分' };
        },
      },
      data: Promise.reject(transportError),
    }));
    mockInitializeApp.mockReturnValue({});
    mockGetFunctions.mockReturnValue({});
    mockHttpsCallable.mockReturnValue(callable);
    const onChunk = jest.fn();
    const onDone = jest.fn();
    const onError = jest.fn();

    await new window.JaAlchemyApiService().generateResponseStream(
      'テストです', 'v2', undefined, onChunk, onDone, onError
    );

    expect(onChunk).toHaveBeenCalledWith('分', '分');
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('network disconnected', {});
  });

  test('maps a thrown daily allowance exhaustion denial', async () => {
    const denial = new Error('resource exhausted');
    denial.details = {
      reason: 'daily_allowance_exhausted',
      limit: 20,
      resetAt: '2026-09-10T00:00:00.000Z',
    };
    const callable = jest.fn();
    callable.stream = jest.fn(async () => {
      throw denial;
    });
    mockInitializeApp.mockReturnValue({});
    mockGetFunctions.mockReturnValue({});
    mockHttpsCallable.mockReturnValue(callable);
    const onDone = jest.fn();
    const onError = jest.fn();

    await new window.JaAlchemyApiService().generateResponseStream(
      'テストです', 'v2', undefined, jest.fn(), onDone, onError
    );

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('今日的 AI 分析額度已用完。', {
      type: 'daily_allowance_exhausted',
      allowance: {
        limit: 20,
        remaining: 0,
        resetAt: '2026-09-10T00:00:00.000Z',
      },
    });
  });

  test('maps a thrown allowance enforcement outage denial', async () => {
    const denial = new Error('unavailable');
    denial.details = { reason: 'unavailable' };
    const callable = jest.fn();
    callable.stream = jest.fn(async () => {
      throw denial;
    });
    mockInitializeApp.mockReturnValue({});
    mockGetFunctions.mockReturnValue({});
    mockHttpsCallable.mockReturnValue(callable);
    const onDone = jest.fn();
    const onError = jest.fn();

    await new window.JaAlchemyApiService().generateResponseStream(
      'テストです', 'v2', undefined, jest.fn(), onDone, onError
    );

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('暫時無法確認每日分析額度，請稍後再試。', {
      type: 'allowance_enforcement_outage',
    });
  });

  test('maps a thrown missing IP denial', async () => {
    const denial = new Error('missing IP');
    denial.details = { reason: 'missing_ip' };
    const callable = jest.fn();
    callable.stream = jest.fn(async () => {
      throw denial;
    });
    mockInitializeApp.mockReturnValue({});
    mockGetFunctions.mockReturnValue({});
    mockHttpsCallable.mockReturnValue(callable);
    const onDone = jest.fn();
    const onError = jest.fn();

    await new window.JaAlchemyApiService().generateResponseStream(
      'テストです', 'v2', undefined, jest.fn(), onDone, onError
    );

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('無法確認此未登入請求的來源，因此無法開始分析。', {
      type: 'client_identity_unavailable',
    });
  });
});
