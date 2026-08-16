import {
  MANAGED_PROVIDER_MODE,
  PERSONAL_PROVIDER_MODE,
  ANALYSIS_PROVIDER_MODE_KEY,
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
    personalProviderModel: {
      ...createField(values.model || ''),
      disabled: true,
      replaceChildren: jest.fn(),
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
    expect(elements.personalProviderStatus.textContent).toContain('直接傳送至此提供者');
    expect(global.chrome.permissions.request).toHaveBeenCalledTimes(1);
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
    expect(store).toEqual({ [ANALYSIS_PROVIDER_MODE_KEY]: MANAGED_PROVIDER_MODE });
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
