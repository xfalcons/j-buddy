describe('background provider-storage boundary', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('locks local storage while preserving the content-script selection relay', async () => {
    let messageListener;
    const stored = {};
    global.chrome = {
      storage: {
        local: {
          get: jest.fn(async () => ({})),
          set: jest.fn(async (values) => Object.assign(stored, values)),
          remove: jest.fn(async () => undefined),
          setAccessLevel: jest.fn(async () => undefined),
        },
      },
      runtime: {
        onInstalled: { addListener: jest.fn() },
        onMessage: {
          addListener: jest.fn((listener) => {
            messageListener = listener;
          }),
        },
      },
      action: { onClicked: { addListener: jest.fn() } },
      sidePanel: { setOptions: jest.fn(), open: jest.fn() },
    };

    await import('../src/scripts/background.js');
    await Promise.resolve();

    const response = jest.fn();
    messageListener({
      action: 'textSelected',
      data: '日本語',
      contextBefore: '前',
      contextAfter: '後',
      apiKey: 'must-not-be-returned',
    }, {}, response);

    expect(global.chrome.storage.local.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
    expect(stored).toEqual({
      selectedText: '日本語',
      contextBefore: '前',
      contextAfter: '後',
    });
    expect(response).toHaveBeenCalledWith({ status: 'success' });
  });
});
