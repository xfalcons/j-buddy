import {
  MANAGED_PROVIDER_MODE,
  PERSONAL_PROVIDER_MODE,
  ANALYSIS_PROVIDER_MODE_KEY,
  PERSONAL_PROVIDER_PROFILE_KEY,
  PERSONAL_PROVIDER_REVISION_KEY,
} from '../src/scripts/personalProvider.js';
import {
  handlePersonalProviderClear,
  handlePersonalProviderModeChange,
  handlePersonalProviderSave,
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
    personalProviderModel: createField(values.model || ''),
    personalProviderForm: { hidden: true },
    personalProviderSummary: { textContent: '' },
    personalProviderStatus: { textContent: '', hidden: false, focus: jest.fn() },
    personalProviderError: { textContent: '', hidden: true, focus: jest.fn() },
    savePersonalProviderButton: { disabled: false },
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
    expect(elements.personalProviderSummary.textContent).toBe('Managed');
    expect(elements.personalProviderStatus.textContent).toContain('Configure one OpenAI-compatible provider');
  });

  test('saving a ready personal provider shows its active model without exposing its key', async () => {
    const { store } = setupChrome();
    const elements = createElements({
      apiUrl: 'https://api.example.test/v1/',
      apiKey: 'personal-secret-key',
      model: 'example-model',
    });

    await handlePersonalProviderSave(elements);

    expect(store).toEqual(expect.objectContaining({
      [ANALYSIS_PROVIDER_MODE_KEY]: PERSONAL_PROVIDER_MODE,
      [PERSONAL_PROVIDER_PROFILE_KEY]: expect.objectContaining({ apiKey: 'personal-secret-key' }),
      [PERSONAL_PROVIDER_REVISION_KEY]: 1,
    }));
    expect(elements.personalProviderSummary.textContent).toBe('Personal · example-model');
    expect(elements.personalProviderForm.hidden).toBe(false);
    expect(elements.personalProviderSummary.textContent).not.toContain('personal-secret-key');
    expect(elements.personalProviderApiKey.value).toBe('');
    expect(elements.personalProviderStatus.textContent).toContain('sent directly');
  });

  test('invalid setup remains managed, reports the issue, and moves focus to the missing field', async () => {
    const { store } = setupChrome();
    const elements = createElements({ apiUrl: 'https://api.example.test/v1', model: 'example-model' });

    await handlePersonalProviderSave(elements);

    expect(store[ANALYSIS_PROVIDER_MODE_KEY]).toBeUndefined();
    expect(elements.personalProviderError.textContent).toContain('API key');
    expect(elements.personalProviderApiKey.focus).toHaveBeenCalled();
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
    expect(elements.personalProviderError.textContent).toContain('Personal analysis is selected but unavailable');
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
    expect(elements.personalProviderStatus.textContent).toContain('cleared');
  });

  test('personal route cannot be selected until its provider is ready and does not start analysis', async () => {
    setupChrome();
    const elements = createElements();

    await handlePersonalProviderModeChange(elements, PERSONAL_PROVIDER_MODE);

    expect(elements.personalProviderError.textContent).toContain('Personal provider setup is incomplete');
    expect(elements.providerModeButtons[0].classList.contains('selected')).toBe(true);
  });

  test('redaction never reveals an API key that is four characters or fewer', () => {
    expect(redactPersonalProviderApiKey('abcd')).toBe('••••');
    expect(redactPersonalProviderApiKey('abcdef')).toBe('••••cdef');
  });
});
