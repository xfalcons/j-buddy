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
    callable.stream = jest.fn(async () => ({
      stream: {
        async *[Symbol.asyncIterator]() {
          yield { content: '分' };
          yield { content: '析' };
        },
      },
      data: Promise.resolve({ success: true }),
    }));
    mockInitializeApp.mockReturnValue({});
    mockGetFunctions.mockReturnValue(functions);
    mockHttpsCallable.mockReturnValue(callable);
    const onChunk = jest.fn();
    const onDone = jest.fn();
    const onError = jest.fn();

    await new window.JaAlchemyApiService().generateResponseStream(
      'テストです', 'v2', undefined, onChunk, onDone, onError
    );

    expect(mockHttpsCallable).toHaveBeenCalledWith(functions, 'explainStreamCallable');
    expect(onChunk).toHaveBeenNthCalledWith(1, '分', '分');
    expect(onChunk).toHaveBeenNthCalledWith(2, '析', '分析');
    expect(onDone).toHaveBeenCalledWith('分析');
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
    expect(onError).toHaveBeenCalledWith('rate limited');
  });

  test('reports a provider failure after partial content without finalizing analysis', async () => {
    const callable = jest.fn();
    callable.stream = jest.fn(async () => ({
      stream: {
        async *[Symbol.asyncIterator]() {
          yield { content: '分' };
        },
      },
      data: Promise.resolve({ success: false, error: 'provider unavailable' }),
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
    expect(onError).toHaveBeenCalledWith('provider unavailable');
  });
});
