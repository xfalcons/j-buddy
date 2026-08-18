import {
  MANAGED_PROVIDER_MODE,
  CHAT_COMPLETIONS_PROTOCOL,
  PERSONAL_PROVIDER_MODE,
  RESPONSES_PROTOCOL,
  ANALYSIS_PROVIDER_MODE_KEY,
  PERSONAL_PROVIDER_CATALOG_KEY_PREFIX,
  PERSONAL_PROVIDER_PROFILE_KEY,
  PERSONAL_PROVIDER_REVISION_KEY,
} from '../src/scripts/personalProvider.js';
import {
  handlePersonalProviderClear,
  handlePersonalProviderLoadModels,
  handlePersonalProviderModeChange,
  handlePersonalProviderSave,
  invalidatePersonalProviderModelCatalog,
  initializePersonalProviderSettings,
  redactPersonalProviderApiKey,
} from '../src/sidepanel/sidepanel.js';

function createClassList(initial = []) {
  const classes = new Set(initial);
  return {
    add: jest.fn((name) => classes.add(name)),
    remove: jest.fn((name) => classes.delete(name)),
    toggle: jest.fn((name, force) => {
      if (force) classes.add(name);
      else classes.delete(name);
      return force;
    }),
    contains: (name) => classes.has(name),
  };
}

function setupChrome(initial = {}, permittedOrigins = []) {
  const store = { ...initial };
  const permissions = new Set(permittedOrigins);
  global.chrome = {
    storage: {
      local: {
        get: jest.fn(async (keys) => keys.reduce((result, key) => ({
          ...result,
          [key]: store[key],
        }), {})),
        set: jest.fn(async (values) => Object.assign(store, values)),
        remove: jest.fn(async (keys) => keys.forEach((key) => delete store[key])),
        setAccessLevel: jest.fn(async () => undefined),
      },
    },
    permissions: {
      contains: jest.fn(async ({ origins }) => origins.every((origin) => permissions.has(origin))),
      request: jest.fn(async ({ origins }) => {
        origins.forEach((origin) => permissions.add(origin));
        return true;
      }),
      remove: jest.fn(async ({ origins }) => {
        origins.forEach((origin) => permissions.delete(origin));
        return true;
      }),
    },
  };
  return { store, permissions };
}

function createField(value = '') {
  return { value, focus: jest.fn() };
}

function createElements(values = {}) {
  const managedButton = {
    dataset: { providerMode: MANAGED_PROVIDER_MODE },
    classList: createClassList(['selected']),
    setAttribute: jest.fn(),
  };
  const personalButton = {
    dataset: { providerMode: PERSONAL_PROVIDER_MODE },
    classList: createClassList(),
    setAttribute: jest.fn(),
  };
  return {
    providerModeButtons: [managedButton, personalButton],
    personalProviderModeButton: personalButton,
    personalProviderApiUrl: createField(values.apiUrl || ''),
    personalProviderApiKey: createField(values.apiKey || ''),
    personalProviderProtocol: createField(values.protocol || CHAT_COMPLETIONS_PROTOCOL),
    personalProviderModel: {
      ...createField(values.model || ''),
      disabled: true,
      replaceChildren: jest.fn(),
    },
    personalProviderCatalogModelField: { hidden: false },
    personalProviderManualModelField: { hidden: true },
    personalProviderManualModel: {
      ...createField(values.manualModel || ''),
      disabled: true,
    },
    personalProviderForm: { hidden: true },
    personalProviderSummary: { textContent: '' },
    personalProviderStatus: { textContent: '', hidden: false, focus: jest.fn() },
    personalProviderError: { textContent: '', hidden: true, focus: jest.fn() },
    savePersonalProviderButton: { disabled: false },
    loadPersonalProviderModelsButton: { disabled: false },
    clearPersonalProviderButton: { disabled: false },
  };
}

describe('sidepanel personal-provider settings', () => {
  beforeEach(() => {
    global.JaAlchemyApiService = class JaAlchemyApiService {
      generateResponseStream = jest.fn();
    };
  });

  test('first run keeps managed selected and explains how to set up personal analysis', async () => {
    setupChrome();
    const elements = createElements();

    await initializePersonalProviderSettings(elements);

    expect(elements.providerModeButtons[0].classList.contains('selected')).toBe(true);
    expect(elements.providerModeButtons[1].classList.contains('selected')).toBe(false);
    expect(elements.personalProviderForm.hidden).toBe(true);
    expect(elements.personalProviderSummary.textContent).toBe('代管');
    expect(elements.personalProviderStatus.textContent).toContain('設定一個相容於 OpenAI 的提供者');
  });

  test('saving a ready personal provider shows its active model without exposing its key', async () => {
    const { store } = setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
      model: 'example-model',
    });

    const modelService = { loadModels: jest.fn(async () => ['example-model']) };
    await handlePersonalProviderLoadModels(elements, modelService);
    elements.personalProviderModel.value = 'example-model';
    await handlePersonalProviderSave(elements);

    expect(store).toEqual(expect.objectContaining({
      [ANALYSIS_PROVIDER_MODE_KEY]: PERSONAL_PROVIDER_MODE,
      [PERSONAL_PROVIDER_PROFILE_KEY]: expect.objectContaining({ apiKey: 'personal-secret-key' }),
      [PERSONAL_PROVIDER_REVISION_KEY]: 1,
    }));
    expect(elements.personalProviderSummary.textContent).toBe('個人 · example-model');
    expect(elements.personalProviderForm.hidden).toBe(false);
    expect(elements.personalProviderSummary.textContent).not.toContain('personal-secret-key');
    expect(elements.personalProviderApiKey.value).toBe('****************');
    expect(elements.personalProviderModel.value).toBe('example-model');
    expect(elements.personalProviderStatus.textContent).toContain('直接傳送至此提供者');
    expect(global.chrome.permissions.request).toHaveBeenCalledTimes(1);
  });

  test('reopens a saved Model catalog offline with provider order and selection intact', async () => {
    setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    const modelService = { loadModels: jest.fn(async () => ['model-b', 'model-a']) };

    await handlePersonalProviderLoadModels(elements, modelService);
    elements.personalProviderModel.value = 'model-a';
    await handlePersonalProviderSave(elements);
    global.chrome.permissions.request.mockClear();

    const reopenedElements = createElements();
    await initializePersonalProviderSettings(reopenedElements);

    expect(reopenedElements.personalProviderModel.disabled).toBe(false);
    expect(reopenedElements.personalProviderModel.value).toBe('model-a');
    const renderedOptions = reopenedElements.personalProviderModel.replaceChildren.mock.calls.at(-1);
    expect(renderedOptions.map((option) => option.value)).toEqual(['', 'model-b', 'model-a']);
    expect(reopenedElements.loadPersonalProviderModelsButton.textContent).toBe('重新載入模型');
    expect(modelService.loadModels).toHaveBeenCalledTimes(1);
    expect(global.chrome.permissions.request).not.toHaveBeenCalled();
  });

  test('hides an inapplicable saved catalog and restores it when the connection identity is reverted', async () => {
    setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    const modelService = { loadModels: jest.fn(async () => ['model-b', 'model-a']) };
    await handlePersonalProviderLoadModels(elements, modelService);
    elements.personalProviderModel.value = 'model-a';
    await handlePersonalProviderSave(elements);

    elements.personalProviderApiUrl.value = 'https://api.example.test/v2';
    await invalidatePersonalProviderModelCatalog(elements);
    expect(elements.personalProviderModel.disabled).toBe(true);
    expect(elements.personalProviderModel.value).toBe('');
    expect(elements.loadPersonalProviderModelsButton.textContent).toBe('載入模型');

    elements.personalProviderApiUrl.value = 'https://api.example.test/v1';
    await invalidatePersonalProviderModelCatalog(elements);
    expect(elements.personalProviderModel.disabled).toBe(false);
    expect(elements.personalProviderModel.value).toBe('model-a');
    const restoredOptions = elements.personalProviderModel.replaceChildren.mock.calls.at(-1);
    expect(restoredOptions.map((option) => option.value)).toEqual(['', 'model-b', 'model-a']);
    expect(elements.loadPersonalProviderModelsButton.textContent).toBe('重新載入模型');
    expect(modelService.loadModels).toHaveBeenCalledTimes(1);

    elements.personalProviderProtocol.value = RESPONSES_PROTOCOL;
    await invalidatePersonalProviderModelCatalog(elements);
    expect(elements.personalProviderModel.value).toBe('');
    elements.personalProviderProtocol.value = CHAT_COMPLETIONS_PROTOCOL;
    await invalidatePersonalProviderModelCatalog(elements);
    expect(elements.personalProviderModel.value).toBe('model-a');

    elements.personalProviderApiKey.value = 'replacement-secret-key';
    await invalidatePersonalProviderModelCatalog(elements);
    expect(elements.personalProviderModel.value).toBe('');
    elements.personalProviderApiKey.value = 'personal-secret-key';
    await invalidatePersonalProviderModelCatalog(elements);
    expect(elements.personalProviderModel.value).toBe('model-a');
    expect(modelService.loadModels).toHaveBeenCalledTimes(1);
  });

  test('keeps the current catalog visible while Reload runs and persists success immediately', async () => {
    const { store } = setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    let resolveReload;
    const modelService = {
      loadModels: jest.fn()
        .mockResolvedValueOnce(['model-b', 'model-a'])
        .mockImplementationOnce(() => new Promise((resolve) => { resolveReload = resolve; })),
    };
    await handlePersonalProviderLoadModels(elements, modelService);
    elements.personalProviderModel.value = 'model-a';
    await handlePersonalProviderSave(elements);

    const reloading = handlePersonalProviderLoadModels(elements, modelService);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(elements.loadPersonalProviderModelsButton.disabled).toBe(true);
    expect(elements.personalProviderModel.value).toBe('model-a');
    expect(modelService.loadModels).toHaveBeenCalledTimes(2);

    resolveReload(['model-c', 'model-a']);
    await reloading;

    expect(elements.personalProviderModel.value).toBe('model-a');
    expect(store[PERSONAL_PROVIDER_REVISION_KEY]).toBe(1);
    expect(store[PERSONAL_PROVIDER_PROFILE_KEY].model).toBe('model-a');
    expect(store[`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}1`].modelIds)
      .toEqual(['model-c', 'model-a']);
    expect(elements.loadPersonalProviderModelsButton.textContent).toBe('重新載入模型');
    expect(elements.personalProviderStatus.textContent).toContain('已重新載入');
  });

  test('keeps an omitted saved model selected and warns without changing the profile', async () => {
    const { store } = setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    const modelService = { loadModels: jest.fn()
      .mockResolvedValueOnce(['model-b', 'model-a'])
      .mockResolvedValueOnce(['model-b']) };
    await handlePersonalProviderLoadModels(elements, modelService);
    elements.personalProviderModel.value = 'model-a';
    await handlePersonalProviderSave(elements);

    await handlePersonalProviderLoadModels(elements, modelService);

    expect(elements.personalProviderModel.value).toBe('model-a');
    const options = elements.personalProviderModel.replaceChildren.mock.calls.at(-1);
    expect(options.map((option) => option.value)).toEqual(['', 'model-a', 'model-b']);
    expect(options[1].textContent).toContain('目錄中沒有');
    expect(elements.personalProviderError.textContent).toContain('model-a');
    expect(elements.personalProviderError.focus).not.toHaveBeenCalled();
    expect(store[PERSONAL_PROVIDER_PROFILE_KEY].model).toBe('model-a');
  });

  test('retains the last-known-good catalog when Reload fails', async () => {
    setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    const modelService = { loadModels: jest.fn()
      .mockResolvedValueOnce(['model-b', 'model-a'])
      .mockRejectedValueOnce(new Error('provider unavailable')) };
    await handlePersonalProviderLoadModels(elements, modelService);
    elements.personalProviderModel.value = 'model-a';
    await handlePersonalProviderSave(elements);

    await handlePersonalProviderLoadModels(elements, modelService);

    expect(elements.personalProviderModel.value).toBe('model-a');
    const options = elements.personalProviderModel.replaceChildren.mock.calls.at(-1);
    expect(options.map((option) => option.value)).toEqual(['', 'model-b', 'model-a']);
    expect(elements.loadPersonalProviderModelsButton.textContent).toBe('重新載入模型');
    expect(elements.personalProviderError.textContent).toContain('provider unavailable');
  });

  test('retains the last-known-good catalog when Reload permission is denied', async () => {
    setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    const modelService = { loadModels: jest.fn(async () => ['model-a']) };
    await handlePersonalProviderLoadModels(elements, modelService);
    elements.personalProviderModel.value = 'model-a';
    await handlePersonalProviderSave(elements);
    global.chrome.permissions.request.mockResolvedValueOnce(false);

    await handlePersonalProviderLoadModels(elements, modelService);

    expect(modelService.loadModels).toHaveBeenCalledTimes(1);
    expect(elements.personalProviderModel.value).toBe('model-a');
    expect(elements.loadPersonalProviderModelsButton.textContent).toBe('重新載入模型');
    expect(elements.personalProviderError.textContent).toContain('未取得提供者存取權');
  });

  test('preserves a model choice changed during Reload completion', async () => {
    setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    let resolveReload;
    const modelService = {
      loadModels: jest.fn()
        .mockResolvedValueOnce(['model-a', 'model-b'])
        .mockImplementationOnce(() => new Promise((resolve) => { resolveReload = resolve; })),
    };
    await handlePersonalProviderLoadModels(elements, modelService);
    elements.personalProviderModel.value = 'model-a';
    await handlePersonalProviderSave(elements);

    const reloading = handlePersonalProviderLoadModels(elements, modelService);
    await new Promise((resolve) => setTimeout(resolve, 0));
    elements.personalProviderModel.value = 'model-b';
    resolveReload(['model-b', 'model-c']);
    await reloading;

    expect(elements.personalProviderModel.value).toBe('model-b');
    expect(elements.personalProviderError.textContent).toBe('');
  });

  test('keeps refreshed models session-staged when immediate persistence fails', async () => {
    const { store } = setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    const modelService = { loadModels: jest.fn()
      .mockResolvedValueOnce(['model-a'])
      .mockResolvedValueOnce(['model-b', 'model-a']) };
    await handlePersonalProviderLoadModels(elements, modelService);
    elements.personalProviderModel.value = 'model-a';
    await handlePersonalProviderSave(elements);
    const priorCatalog = structuredClone(store[`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}1`]);
    global.chrome.storage.local.set.mockRejectedValueOnce(new Error('storage failed'));

    await handlePersonalProviderLoadModels(elements, modelService);

    expect(elements.personalProviderModel.value).toBe('model-a');
    const options = elements.personalProviderModel.replaceChildren.mock.calls.at(-1);
    expect(options.map((option) => option.value)).toEqual(['', 'model-b', 'model-a']);
    expect(store[`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}1`]).toEqual(priorCatalog);
    expect(elements.personalProviderError.textContent).toContain('重新開啟後不會保留');

    elements.personalProviderModel.value = 'model-b';
    await handlePersonalProviderSave(elements);
    expect(store[PERSONAL_PROVIDER_PROFILE_KEY].model).toBe('model-b');
  });

  test('keeps edited-connection discovery session-staged until Save', async () => {
    const { store } = setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    const modelService = { loadModels: jest.fn()
      .mockResolvedValueOnce(['model-a'])
      .mockResolvedValueOnce(['edited-model']) };
    await handlePersonalProviderLoadModels(elements, modelService);
    elements.personalProviderModel.value = 'model-a';
    await handlePersonalProviderSave(elements);
    const priorCatalog = structuredClone(store[`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}1`]);

    elements.personalProviderApiUrl.value = 'https://api.example.test/v2';
    await invalidatePersonalProviderModelCatalog(elements);
    await handlePersonalProviderLoadModels(elements, modelService);

    expect(elements.personalProviderModel.value).toBe('');
    expect(store[PERSONAL_PROVIDER_REVISION_KEY]).toBe(1);
    expect(store[`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}1`]).toEqual(priorCatalog);
    elements.personalProviderModel.value = 'edited-model';
    await handlePersonalProviderSave(elements);
    expect(store[PERSONAL_PROVIDER_REVISION_KEY]).toBe(2);
    expect(store[PERSONAL_PROVIDER_PROFILE_KEY].apiUrl).toBe('https://api.example.test/v2');
  });

  test('renders a saved Responses-compatible protocol while keeping the API key masked', async () => {
    setupChrome({
      [ANALYSIS_PROVIDER_MODE_KEY]: PERSONAL_PROVIDER_MODE,
      [PERSONAL_PROVIDER_PROFILE_KEY]: {
        apiUrl: 'https://api.example.test/v1',
        apiKey: 'personal-secret-key',
        model: 'responses-model',
        protocol: RESPONSES_PROTOCOL,
      },
      [PERSONAL_PROVIDER_REVISION_KEY]: 1,
    }, ['https://api.example.test/*']);
    const elements = createElements();

    await initializePersonalProviderSettings(elements);

    expect(elements.personalProviderProtocol.value).toBe(RESPONSES_PROTOCOL);
    expect(elements.personalProviderApiKey.value).toBe('****************');
  });

  test('restores a cacheless saved model as the selected saved-only option', async () => {
    setupChrome({
      [ANALYSIS_PROVIDER_MODE_KEY]: PERSONAL_PROVIDER_MODE,
      [PERSONAL_PROVIDER_PROFILE_KEY]: {
        apiUrl: 'https://api.example.test/v1',
        apiKey: 'personal-secret-key',
        model: 'saved-model',
        protocol: CHAT_COMPLETIONS_PROTOCOL,
      },
      [PERSONAL_PROVIDER_REVISION_KEY]: 1,
    }, ['https://api.example.test/*']);
    const elements = createElements();

    await initializePersonalProviderSettings(elements);

    expect(elements.personalProviderModel.disabled).toBe(false);
    expect(elements.personalProviderModel.value).toBe('saved-model');
    const renderedOptions = elements.personalProviderModel.replaceChildren.mock.calls.at(-1);
    expect(renderedOptions).toHaveLength(2);
    expect(renderedOptions[1]).toEqual(expect.objectContaining({
      value: 'saved-model',
      textContent: 'saved-model（已儲存）',
    }));
  });

  test('saves an unchanged saved-only selection without rediscovering models', async () => {
    const { store } = setupChrome({
      [ANALYSIS_PROVIDER_MODE_KEY]: PERSONAL_PROVIDER_MODE,
      [PERSONAL_PROVIDER_PROFILE_KEY]: {
        apiUrl: 'https://api.example.test/v1',
        apiKey: 'personal-secret-key',
        model: 'saved-model',
        protocol: CHAT_COMPLETIONS_PROTOCOL,
      },
      [PERSONAL_PROVIDER_REVISION_KEY]: 1,
    }, ['https://api.example.test/*']);
    const elements = createElements();

    await initializePersonalProviderSettings(elements);
    const state = await handlePersonalProviderSave(elements);

    expect(state).not.toBeNull();
    expect(store[PERSONAL_PROVIDER_PROFILE_KEY]).toEqual(expect.objectContaining({
      model: 'saved-model',
    }));
    expect(store[PERSONAL_PROVIDER_REVISION_KEY]).toBe(2);
    expect(elements.personalProviderError.textContent).toBe('');
    expect(elements.personalProviderStatus.textContent).toContain('直接傳送至此提供者');
  });

  test('does not treat a new arbitrary model as the unchanged saved selection', async () => {
    const { store } = setupChrome({
      [ANALYSIS_PROVIDER_MODE_KEY]: PERSONAL_PROVIDER_MODE,
      [PERSONAL_PROVIDER_PROFILE_KEY]: {
        apiUrl: 'https://api.example.test/v1',
        apiKey: 'personal-secret-key',
        model: 'saved-model',
        protocol: CHAT_COMPLETIONS_PROTOCOL,
      },
      [PERSONAL_PROVIDER_REVISION_KEY]: 1,
    }, ['https://api.example.test/*']);
    const elements = createElements();

    await initializePersonalProviderSettings(elements);
    elements.personalProviderModel.value = 'unverified-model';
    const state = await handlePersonalProviderSave(elements);

    expect(state).toBeNull();
    expect(store[PERSONAL_PROVIDER_PROFILE_KEY].model).toBe('saved-model');
    expect(store[PERSONAL_PROVIDER_REVISION_KEY]).toBe(1);
    expect(elements.personalProviderError.textContent).toContain('載入模型');
  });

  test('preserves the saved model across managed and personal mode renders', async () => {
    setupChrome({
      [ANALYSIS_PROVIDER_MODE_KEY]: PERSONAL_PROVIDER_MODE,
      [PERSONAL_PROVIDER_PROFILE_KEY]: {
        apiUrl: 'https://api.example.test/v1',
        apiKey: 'personal-secret-key',
        model: 'saved-model',
        protocol: CHAT_COMPLETIONS_PROTOCOL,
      },
      [PERSONAL_PROVIDER_REVISION_KEY]: 1,
    }, ['https://api.example.test/*']);
    const elements = createElements();

    await initializePersonalProviderSettings(elements);
    await handlePersonalProviderModeChange(elements, MANAGED_PROVIDER_MODE);
    expect(elements.personalProviderModel.value).toBe('saved-model');

    await handlePersonalProviderModeChange(elements, PERSONAL_PROVIDER_MODE);
    expect(elements.personalProviderModel.value).toBe('saved-model');
    expect(elements.personalProviderForm.hidden).toBe(false);
  });

  test('saves a catalog-selected Responses-compatible provider through the existing permission flow', async () => {
    const { store } = setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
      protocol: RESPONSES_PROTOCOL,
    });
    const modelService = { loadModels: jest.fn(async () => ['responses-model']) };

    await handlePersonalProviderLoadModels(elements, modelService);
    elements.personalProviderModel.value = 'responses-model';
    await handlePersonalProviderSave(elements);

    expect(modelService.loadModels).toHaveBeenCalledWith({
      apiUrl: 'https://api.example.test/v1',
      apiKey: 'personal-secret-key',
      protocol: RESPONSES_PROTOCOL,
    }, expect.any(Object));
    expect(store[PERSONAL_PROVIDER_PROFILE_KEY]).toEqual(expect.objectContaining({
      model: 'responses-model',
      protocol: RESPONSES_PROTOCOL,
    }));
    expect(global.chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://api.example.test/*'],
    });
  });

  test('loads models into a required picker before allowing a staged profile to save', async () => {
    const { store } = setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    const modelService = { loadModels: jest.fn(async () => ['model-b', 'model-a']) };

    await handlePersonalProviderLoadModels(elements, modelService);

    expect(modelService.loadModels).toHaveBeenCalledWith({
      apiUrl: 'https://api.example.test/v1',
      apiKey: 'personal-secret-key',
      protocol: CHAT_COMPLETIONS_PROTOCOL,
    }, expect.objectContaining({ signal: expect.any(Object) }));
    expect(elements.personalProviderModel.disabled).toBe(false);
    expect(elements.personalProviderModel.value).toBe('');
    expect(elements.personalProviderModel.replaceChildren).toHaveBeenCalled();

    await handlePersonalProviderSave(elements);
    expect(store[PERSONAL_PROVIDER_PROFILE_KEY]).toBeUndefined();

    elements.personalProviderModel.value = 'model-a';
    await handlePersonalProviderSave(elements);
    expect(store[PERSONAL_PROVIDER_PROFILE_KEY]).toEqual(expect.objectContaining({ model: 'model-a' }));
  });

  test('starts the optional permission request synchronously from the Load gesture', async () => {
    setupChrome();
    let resolvePermission;
    global.chrome.permissions.request.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePermission = resolve;
    }));
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    const modelService = { loadModels: jest.fn() };

    const loading = handlePersonalProviderLoadModels(elements, modelService);

    expect(global.chrome.permissions.request).toHaveBeenCalledTimes(1);
    expect(modelService.loadModels).not.toHaveBeenCalled();
    resolvePermission(false);
    await loading;
  });

  test('requires a fresh catalog selection after the personal-provider protocol changes', async () => {
    const { store } = setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    const modelService = { loadModels: jest.fn(async () => ['shared-model']) };

    await handlePersonalProviderLoadModels(elements, modelService);
    elements.personalProviderModel.value = 'shared-model';
    elements.personalProviderProtocol.value = RESPONSES_PROTOCOL;
    await handlePersonalProviderSave(elements);

    expect(store[PERSONAL_PROVIDER_PROFILE_KEY]).toBeUndefined();
    expect(elements.personalProviderError.textContent).toContain('請使用目前的 API 網址與 API 金鑰載入模型');
  });

  test('invalidates an in-flight catalog and removes a newly granted unsaved origin permission', async () => {
    const { permissions } = setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    let resolveModels;
    const modelService = { loadModels: jest.fn(() => new Promise((resolve) => { resolveModels = resolve; })) };

    const loading = handlePersonalProviderLoadModels(elements, modelService);
    await new Promise((resolve) => setTimeout(resolve, 0));
    elements.personalProviderApiKey.value = 'replacement-key';
    await invalidatePersonalProviderModelCatalog(elements);
    resolveModels(['stale-model']);
    await loading;

    expect(elements.personalProviderModel.disabled).toBe(true);
    expect(elements.personalProviderModel.value).toBe('');
    expect(permissions.has('https://api.example.test/*')).toBe(false);
    expect(global.chrome.permissions.remove).toHaveBeenCalledWith({
      origins: ['https://api.example.test/*'],
    });
  });

  test('releases newly granted permission when the form changes before discovery completes', async () => {
    const { permissions } = setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    let resolveModels;
    const modelService = { loadModels: jest.fn(() => new Promise((resolve) => {
      resolveModels = resolve;
    })) };

    const loading = handlePersonalProviderLoadModels(elements, modelService);
    await new Promise((resolve) => setTimeout(resolve, 0));
    elements.personalProviderApiUrl.value = 'https://api.example.test/v2';
    resolveModels(['unused-model']);
    await loading;

    expect(permissions.has('https://api.example.test/*')).toBe(false);
    expect(global.chrome.permissions.remove).toHaveBeenCalledWith({
      origins: ['https://api.example.test/*'],
    });
    expect(elements.personalProviderModel.value).toBe('');
  });

  test('re-enables model discovery after a catalog failure and releases its temporary permission', async () => {
    const { permissions } = setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    const modelService = { loadModels: jest.fn(async () => {
      throw new Error('無法取得模型');
    }) };

    await handlePersonalProviderLoadModels(elements, modelService);

    expect(elements.loadPersonalProviderModelsButton.disabled).toBe(false);
    expect(elements.personalProviderError.textContent).toContain('無法取得模型');
    expect(permissions.has('https://api.example.test/*')).toBe(false);
  });

  test('a Responses catalog failure reveals manual model entry and saves it through host permission', async () => {
    const { store, permissions } = setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
      protocol: RESPONSES_PROTOCOL,
    });
    const modelService = { loadModels: jest.fn(async () => {
      throw new Error('此提供者不支援模型目錄');
    }) };

    await handlePersonalProviderLoadModels(elements, modelService);

    expect(elements.personalProviderCatalogModelField.hidden).toBe(true);
    expect(elements.personalProviderManualModelField.hidden).toBe(false);
    expect(elements.personalProviderManualModel.disabled).toBe(false);
    expect(elements.personalProviderError.textContent).toContain('手動輸入模型 ID');
    expect(permissions.has('https://api.example.test/*')).toBe(false);

    await handlePersonalProviderSave(elements);
    expect(store[PERSONAL_PROVIDER_PROFILE_KEY]).toBeUndefined();
    expect(elements.personalProviderManualModel.focus).toHaveBeenCalled();
    expect(global.chrome.permissions.request).toHaveBeenCalledTimes(1);

    elements.personalProviderManualModel.value = 'manual-responses-model';
    await handlePersonalProviderSave(elements);

    expect(store[PERSONAL_PROVIDER_PROFILE_KEY]).toEqual(expect.objectContaining({
      model: 'manual-responses-model',
      protocol: RESPONSES_PROTOCOL,
      apiKey: 'personal-secret-key',
    }));
    expect(elements.personalProviderApiKey.value).toBe('****************');
    expect(elements.personalProviderStatus.textContent).toContain('直接傳送至此提供者');
    expect(global.chrome.permissions.request).toHaveBeenCalledTimes(2);
    expect(global.chrome.permissions.request).toHaveBeenLastCalledWith({
      origins: ['https://api.example.test/*'],
    });
  });

  test('a Chat Completions catalog failure keeps manual model entry unavailable', async () => {
    const { store } = setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    const modelService = { loadModels: jest.fn(async () => {
      throw new Error('無法取得模型');
    }) };

    await handlePersonalProviderLoadModels(elements, modelService);

    expect(elements.personalProviderCatalogModelField.hidden).toBe(false);
    expect(elements.personalProviderManualModelField.hidden).toBe(true);
    expect(elements.personalProviderManualModel.disabled).toBe(true);
    elements.personalProviderManualModel.value = 'must-not-save';
    await handlePersonalProviderSave(elements);
    expect(store[PERSONAL_PROVIDER_PROFILE_KEY]).toBeUndefined();
  });

  test('denied Responses host permission does not offer manual model entry', async () => {
    setupChrome();
    global.chrome.permissions.request.mockResolvedValue(false);
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
      protocol: RESPONSES_PROTOCOL,
    });
    const modelService = { loadModels: jest.fn() };

    await handlePersonalProviderLoadModels(elements, modelService);

    expect(modelService.loadModels).not.toHaveBeenCalled();
    expect(elements.personalProviderCatalogModelField.hidden).toBe(false);
    expect(elements.personalProviderManualModelField.hidden).toBe(true);
    expect(elements.personalProviderManualModel.disabled).toBe(true);
    expect(elements.personalProviderError.textContent).toContain('未取得提供者存取權');
  });

  test('manual Responses model entry preserves a masked same-origin API key', async () => {
    const { store } = setupChrome({
      [ANALYSIS_PROVIDER_MODE_KEY]: PERSONAL_PROVIDER_MODE,
      [PERSONAL_PROVIDER_PROFILE_KEY]: {
        apiUrl: 'https://api.example.test/v1',
        apiKey: 'personal-secret-key',
        model: 'old-model',
        protocol: RESPONSES_PROTOCOL,
      },
      [PERSONAL_PROVIDER_REVISION_KEY]: 2,
    }, ['https://api.example.test/*']);
    const elements = createElements();
    const modelService = { loadModels: jest.fn(async () => {
      throw new Error('此提供者不支援模型目錄');
    }) };

    await initializePersonalProviderSettings(elements);
    await handlePersonalProviderLoadModels(elements, modelService);
    elements.personalProviderManualModel.value = 'manual-responses-model';
    await handlePersonalProviderSave(elements);

    expect(store[PERSONAL_PROVIDER_PROFILE_KEY]).toEqual(expect.objectContaining({
      apiKey: 'personal-secret-key',
      model: 'manual-responses-model',
      protocol: RESPONSES_PROTOCOL,
    }));
    expect(elements.personalProviderApiKey.value).toBe('****************');
  });

  test('refreshing a staged catalog retains its origin permission', async () => {
    const { permissions } = setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
    });
    const modelService = { loadModels: jest.fn(async () => ['example-model']) };

    await handlePersonalProviderLoadModels(elements, modelService);
    await handlePersonalProviderLoadModels(elements, modelService);

    expect(permissions.has('https://api.example.test/*')).toBe(true);
    expect(global.chrome.permissions.remove).not.toHaveBeenCalled();
    expect(modelService.loadModels).toHaveBeenCalledTimes(2);
  });

  test('invalid setup remains managed, reports the issue, and moves focus to the missing field', async () => {
    const { store } = setupChrome();
    const elements = createElements({ apiUrl: 'https://api.example.test/v1', model: 'example-model' });

    await handlePersonalProviderSave(elements);

    expect(store[ANALYSIS_PROVIDER_MODE_KEY]).toBeUndefined();
    expect(elements.personalProviderError.textContent).toContain('API 金鑰');
    expect(elements.personalProviderApiKey.focus).toHaveBeenCalled();
  });

  test('uses a masked saved key for same-origin model discovery and preserves it on save', async () => {
    const { store } = setupChrome({
      [ANALYSIS_PROVIDER_MODE_KEY]: PERSONAL_PROVIDER_MODE,
      [PERSONAL_PROVIDER_PROFILE_KEY]: {
        apiUrl: 'https://api.example.test/v1',
        apiKey: 'personal-secret-key',
        model: 'old-model',
      },
      [PERSONAL_PROVIDER_REVISION_KEY]: 2,
    }, ['https://api.example.test/*']);
    const elements = createElements();
    const modelService = { loadModels: jest.fn(async () => ['new-model']) };

    await initializePersonalProviderSettings(elements);
    await handlePersonalProviderLoadModels(elements, modelService);
    elements.personalProviderModel.value = 'new-model';
    await handlePersonalProviderSave(elements);

    expect(elements.personalProviderApiKey.value).toBe('****************');
    expect(modelService.loadModels).toHaveBeenCalledWith({
      apiUrl: 'https://api.example.test/v1',
      apiKey: 'personal-secret-key',
      protocol: CHAT_COMPLETIONS_PROTOCOL,
    }, expect.any(Object));
    expect(store[PERSONAL_PROVIDER_PROFILE_KEY]).toEqual(expect.objectContaining({
      apiKey: 'personal-secret-key',
      model: 'new-model',
    }));
  });

  test('does not send a masked key to a different provider origin', async () => {
    setupChrome({
      [ANALYSIS_PROVIDER_MODE_KEY]: PERSONAL_PROVIDER_MODE,
      [PERSONAL_PROVIDER_PROFILE_KEY]: {
        apiUrl: 'https://api.example.test/v1',
        apiKey: 'personal-secret-key',
        model: 'old-model',
      },
      [PERSONAL_PROVIDER_REVISION_KEY]: 2,
    }, ['https://api.example.test/*']);
    const elements = createElements();
    const modelService = { loadModels: jest.fn() };

    await initializePersonalProviderSettings(elements);
    elements.personalProviderApiUrl.value = 'https://another-provider.test/v1';
    await handlePersonalProviderLoadModels(elements, modelService);

    expect(modelService.loadModels).not.toHaveBeenCalled();
    expect(elements.personalProviderError.textContent).toContain('輸入新的 API 金鑰');
  });

  test('a revoked personal selection stays visibly personal and explains that analysis is unavailable', async () => {
    setupChrome({
      [ANALYSIS_PROVIDER_MODE_KEY]: PERSONAL_PROVIDER_MODE,
      [PERSONAL_PROVIDER_PROFILE_KEY]: {
        apiUrl: 'https://api.example.test/v1',
        apiKey: 'personal-secret-key',
        model: 'example-model',
      },
      [PERSONAL_PROVIDER_REVISION_KEY]: 2,
    });
    const elements = createElements();

    await initializePersonalProviderSettings(elements);

    expect(elements.providerModeButtons[1].classList.contains('selected')).toBe(true);
    expect(elements.personalProviderError.textContent).toContain('已選取個人分析，但目前無法使用');
  });

  test('clear requires confirmation and returns the route to managed when confirmed', async () => {
    const { store } = setupChrome({
      [ANALYSIS_PROVIDER_MODE_KEY]: PERSONAL_PROVIDER_MODE,
      [PERSONAL_PROVIDER_PROFILE_KEY]: {
        apiUrl: 'https://api.example.test/v1',
        apiKey: 'personal-secret-key',
        model: 'example-model',
      },
      [PERSONAL_PROVIDER_REVISION_KEY]: 2,
    }, ['https://api.example.test/*']);
    const elements = createElements();

    expect(await handlePersonalProviderClear(elements, () => false)).toBe(false);
    expect(store[ANALYSIS_PROVIDER_MODE_KEY]).toBe(PERSONAL_PROVIDER_MODE);

    expect(await handlePersonalProviderClear(elements, () => true)).toBe(true);
    expect(store).toEqual({
      [ANALYSIS_PROVIDER_MODE_KEY]: MANAGED_PROVIDER_MODE,
      [PERSONAL_PROVIDER_REVISION_KEY]: 2,
    });
    expect(elements.personalProviderForm.hidden).toBe(true);
    expect(elements.personalProviderStatus.textContent).toContain('已清除');
  });

  test('personal route cannot be selected until its provider is ready and does not start analysis', async () => {
    setupChrome();
    const elements = createElements();

    await handlePersonalProviderModeChange(elements, PERSONAL_PROVIDER_MODE);

    expect(elements.personalProviderError.textContent).toContain('個人提供者設定不完整');
    expect(elements.providerModeButtons[0].classList.contains('selected')).toBe(true);
  });

  test('redaction never reveals an API key that is four characters or fewer', () => {
    expect(redactPersonalProviderApiKey('abcd')).toBe('••••');
    expect(redactPersonalProviderApiKey('abcdef')).toBe('••••cdef');
  });
});
