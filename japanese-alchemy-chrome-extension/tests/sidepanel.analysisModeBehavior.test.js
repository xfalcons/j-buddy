import {
  analizingSelectedText,
  handleAnalysisModeChange,
  isValidSelection,
  setSidepanelElementsForTesting,
} from '../src/sidepanel/sidepanel.js';
import { buildContextCacheKey } from '../src/scripts/surroundingContext.js';

function createClassList(initial = []) {
  const classes = new Set(initial);
  return {
    add: jest.fn((name) => classes.add(name)),
    remove: jest.fn((name) => classes.delete(name)),
    toggle: jest.fn((name, force) => {
      if (force === undefined) {
        if (classes.has(name)) {
          classes.delete(name);
          return false;
        }
        classes.add(name);
        return true;
      }
      if (force) classes.add(name);
      else classes.delete(name);
      return force;
    }),
    contains: (name) => classes.has(name),
  };
}

function createButton(variant, selected = false) {
  return {
    dataset: { promptVariant: variant },
    classList: createClassList(selected ? ['selected'] : []),
    attributes: {},
    setAttribute: jest.fn(function setAttribute(name, value) {
      this.attributes[name] = value;
    }),
  };
}

function setupElements() {
  const prose = { innerHTML: 'stale result' };
  const loadingMessage = { textContent: 'AIによる分析中です。しばらくお待ちください...' };
  const result = {
    classList: createClassList(['show']),
    querySelector: jest.fn(() => prose),
  };
  const loading = {
    classList: createClassList(),
    querySelector: jest.fn((selector) => (selector === '.loading-message' ? loadingMessage : null)),
  };
  const alertMessage = {
    innerHTML: '',
    classList: createClassList(),
  };
  const compactButton = createButton('v1');
  const usageButton = createButton('v2', true);
  const elements = {
    alertMessage,
    analysisModeButtons: [compactButton, usageButton],
    result,
  };

  document.getElementById = jest.fn((id) => {
    if (id === 'result') return result;
    if (id === 'loading') return loading;
    if (id === 'alertMessage') return alertMessage;
    return null;
  });

  setSidepanelElementsForTesting(elements);
  return {
    alertMessage,
    compactButton,
    elements,
    loading,
    loadingMessage,
    prose,
    result,
    usageButton,
  };
}

function setupStorage(initial = {}) {
  const store = { ...initial };
  global.chrome.storage.local.get = jest.fn(async (key) => {
    if (Array.isArray(key)) {
      return key.reduce((acc, item) => {
        acc[item] = store[item];
        return acc;
      }, {});
    }
    return { [key]: store[key] };
  });
  global.chrome.storage.local.set = jest.fn(async (obj) => {
    Object.assign(store, obj);
  });
  return store;
}

function setupLocalStorage(initial = {}) {
  const store = { ...initial };
  global.localStorage.getItem = jest.fn((key) => store[key] ?? null);
  global.localStorage.setItem = jest.fn((key, value) => {
    store[key] = value;
  });
  return store;
}

function setupDeferredApi() {
  const calls = [];
  global.JaAlchemyApiService = class JaAlchemyApiService {
    async generateResponseStream(selectedText, promptVariant, context, onChunk, onDone, onError) {
      return new Promise((resolve) => {
        calls.push({
          selectedText,
          promptVariant,
          context,
          onChunk,
          onDone,
          onError,
          resolve,
        });
      });
    }
  };
  return calls;
}

async function flushMicrotasks(cycles = 10) {
  for (let index = 0; index < cycles; index += 1) {
    await Promise.resolve();
  }
}

describe('sidepanel analysis-mode behavior', () => {
  beforeEach(() => {
    jest.useRealTimers();
    setupElements();
    setupStorage({ promptVariant: 'v2' });
    setupLocalStorage();
    setupDeferredApi();
  });

  test('validates the documented inclusive 2-500 character selection range', () => {
    expect(isValidSelection('あ')).toBe(false);
    expect(isValidSelection('あい')).toBe(true);
    expect(isValidSelection('あ'.repeat(500))).toBe(true);
    expect(isValidSelection('あ'.repeat(501))).toBe(false);
  });

  test('mode switch persists v1 and starts re-analysis instead of rendering cached v2', async () => {
    const text = '成長を後押しする';
    const context = { before: '制度が', after: 'という。' };
    const cachedV2Key = buildContextCacheKey({
      selectedText: text,
      context,
      promptVariant: 'v2',
    });
    setupLocalStorage({
      lastAnalysisKey: cachedV2Key,
      lastResponse: '# cached v2 response',
    });
    const apiCalls = setupDeferredApi();
    const { compactButton, prose, result, usageButton } = setupElements();
    const storage = setupStorage({ promptVariant: 'v2' });

    await analizingSelectedText(text, context, { promptVariant: 'v2' });
    expect(prose.innerHTML).toContain('cached v2 response');

    const changePromise = handleAnalysisModeChange(
      { alertMessage: { classList: createClassList(), innerHTML: '' }, analysisModeButtons: [compactButton, usageButton] },
      'v1'
    );
    await flushMicrotasks();

    expect(storage.promptVariant).toBe('v1');
    expect(compactButton.classList.contains('selected')).toBe(true);
    expect(usageButton.classList.contains('selected')).toBe(false);
    expect(result.classList.contains('show')).toBe(false);
    expect(prose.innerHTML).toBe('');
    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0]).toEqual(expect.objectContaining({
      selectedText: text,
      promptVariant: 'v1',
      context,
    }));

    apiCalls[0].onDone('# fresh v1 response');
    apiCalls[0].resolve();
    await changePromise;

    expect(prose.innerHTML).toContain('fresh v1 response');
    expect(global.localStorage.getItem('lastResponse')).toContain('fresh v1 response');
  });

  test('stale stream callbacks and queued previews cannot overwrite the latest mode result', async () => {
    jest.useFakeTimers();
    const text = '成長を後押しする';
    const context = { before: '制度が', after: 'という。' };
    const apiCalls = setupDeferredApi();
    const { prose } = setupElements();

    const oldRequest = analizingSelectedText(text, context, {
      force: true,
      promptVariant: 'v2',
    });
    await flushMicrotasks();
    apiCalls[0].onChunk('', '# old preview');

    const newRequest = analizingSelectedText(text, context, {
      force: true,
      promptVariant: 'v1',
    });
    await flushMicrotasks();
    apiCalls[1].onDone('# latest v1 response');
    apiCalls[1].resolve();
    await newRequest;

    jest.advanceTimersByTime(100);
    apiCalls[0].onDone('# stale v2 response');
    apiCalls[0].resolve();
    await oldRequest;

    expect(prose.innerHTML).toContain('latest v1 response');
    expect(prose.innerHTML).not.toContain('old preview');
    expect(prose.innerHTML).not.toContain('stale v2 response');
    expect(global.localStorage.getItem('lastResponse')).toContain('latest v1 response');
  });

  test('updates the loading message after receiving the first response chunk', async () => {
    const text = '成長を後押しする';
    const apiCalls = setupDeferredApi();
    const { loading, loadingMessage } = setupElements();

    const request = analizingSelectedText(text, {}, { promptVariant: 'v2' });
    await flushMicrotasks();
    apiCalls[0].onChunk('解析', '解析');

    expect(loadingMessage.textContent).toBe('解析結果を受信しました。レイアウトを整えています...');
    expect(loading.classList.contains('show')).toBe(true);

    apiCalls[0].onDone('解析');
    apiCalls[0].resolve();
    await request;
  });

  test('a 429 resets loading and offers no alternate-provider retry', async () => {
    const apiCalls = setupDeferredApi();
    const { alertMessage, loading } = setupElements();

    const request = analizingSelectedText('成長を後押しする', {}, { promptVariant: 'v2' });
    await flushMicrotasks();
    apiCalls[0].onError('Stream request failed: 429 Too many requests');
    apiCalls[0].resolve();
    await request;

    expect(apiCalls).toHaveLength(1);
    expect(loading.classList.contains('show')).toBe(false);
    expect(alertMessage.innerHTML).not.toContain('Retry with ZAI');
    expect(alertMessage.innerHTML).not.toContain('retryWithZaiBtn');
  });

  test('personal mode calls the configured provider directly and keeps its cache separate', async () => {
    const text = '成長を後押しする';
    const storage = setupStorage({
      promptVariant: 'v2',
      analysisProviderMode: 'personal',
      personalProviderRevision: 4,
      personalProviderProfile: {
        apiUrl: 'https://llm.example/v1',
        apiKey: 'personal-secret-key',
        model: 'learner-model',
      },
    });
    global.chrome.permissions.contains = jest.fn(async () => true);
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        choices: [{ message: { content: '### 單字分析\n#### <單字>成長' }, finish_reason: 'stop' }],
      }),
    }));
    const { prose } = setupElements();

    await analizingSelectedText(text, {}, { promptVariant: 'v2' });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://llm.example/v1/chat/completions',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer personal-secret-key' }) })
    );
    expect(prose.innerHTML).toContain('成長');
    expect(global.localStorage.getItem('lastAnalysisKey')).toContain('personal:4');
    expect(global.localStorage.getItem('lastAnalysisKey')).not.toContain('personal-secret-key');
    expect(storage.analysisProviderMode).toBe('personal');
  });

  test('a personal-provider failure stays personal and never caches a partial result', async () => {
    const storage = setupStorage({
      promptVariant: 'v2',
      analysisProviderMode: 'personal',
      personalProviderRevision: 2,
      personalProviderProfile: {
        apiUrl: 'https://llm.example/v1', apiKey: 'key', model: 'model',
      },
    });
    global.chrome.permissions.contains = jest.fn(async () => true);
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => '<b>rate limited</b>',
    }));
    const { alertMessage, prose } = setupElements();

    await analizingSelectedText('成長を後押しする', {}, { promptVariant: 'v2' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(storage.analysisProviderMode).toBe('personal');
    expect(global.localStorage.getItem('lastAnalysisKey')).toBeNull();
    expect(global.localStorage.getItem('lastResponse')).toBeNull();
    expect(alertMessage.textContent).toContain('personal provider');
    expect(alertMessage.textContent).not.toContain('<b>');
    expect(prose.innerHTML).toBe('');
  });

  test('rapid mode clicks keep the last requested mode when storage reads finish out of order', async () => {
    const { compactButton, elements, usageButton } = setupElements();
    const getResolvers = [];
    const storage = setupStorage({ promptVariant: 'v2' });
    global.chrome.storage.local.get = jest.fn(
      () => new Promise((resolve) => getResolvers.push(resolve))
    );

    const firstClick = handleAnalysisModeChange(elements, 'v1');
    await Promise.resolve();
    const secondClick = handleAnalysisModeChange(elements, 'v2');
    await Promise.resolve();

    getResolvers[1]({ promptVariant: 'v2' });
    await secondClick;
    getResolvers[0]({ promptVariant: 'v2' });
    await firstClick;

    expect(storage.promptVariant).toBe('v2');
    expect(global.chrome.storage.local.set).not.toHaveBeenCalled();
    expect(compactButton.classList.contains('selected')).toBe(false);
    expect(usageButton.classList.contains('selected')).toBe(true);
  });

  test('mode switch without a valid selection updates preference without calling the API', async () => {
    const apiCalls = setupDeferredApi();
    const { elements, result } = setupElements();
    const storage = setupStorage({ promptVariant: 'v2' });

    await analizingSelectedText('', {}, { promptVariant: 'v2' });
    await handleAnalysisModeChange(elements, 'v1');

    expect(storage.promptVariant).toBe('v1');
    expect(apiCalls).toHaveLength(0);
    expect(result.classList.contains('show')).toBe(false);
  });
});
