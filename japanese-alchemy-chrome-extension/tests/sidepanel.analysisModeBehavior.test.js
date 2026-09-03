import {
  analizingSelectedText,
  handleCancelAnalysis,
  handleSaveForLater,
  handleAnalysisModeChange,
  handleSidepanelStorageChanges,
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
    textContent: '',
    classList: createClassList(),
  };
  const compactButton = createButton('v1');
  const usageButton = createButton('v2', true);
  const copyButton = { disabled: true };
  const saveAsBtn = { disabled: true };
  const saveForLaterBtn = { disabled: true, classList: createClassList() };
  const cancelAnalysisButton = { hidden: true };
  const analyzeButton = { disabled: true };
  const pendingSelectionStatus = { textContent: '' };
  const elements = {
    alertMessage,
    analysisModeButtons: [compactButton, usageButton],
    cancelAnalysisButton,
    analyzeButton,
    pendingSelectionStatus,
    copyButton,
    prose,
    result,
    saveAsBtn,
    saveForLaterBtn,
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
    cancelAnalysisButton,
    analyzeButton,
    copyButton,
    elements,
    loading,
    loadingMessage,
    prose,
    pendingSelectionStatus,
    result,
    saveAsBtn,
    saveForLaterBtn,
    usageButton,
  };
}

function setupStorage(initial = {}) {
  const store = { ...initial };
  global.chrome.storage.local.get = jest.fn(async (key) => {
    if (key === null) return { ...store };
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

function completedProjection(cacheKey, overrides = {}) {
  return JSON.stringify({
    version: 1,
    cacheKey,
    response: '### 單字分析\n#### <單字>成長\ngrowth',
    html: '<h3>單字分析</h3><h4><input type="checkbox" name="words" value="成長">成長</h4><p>growth</p>',
    json: {
      words: [{ term: '成長', detail: 'growth' }],
      grammars: [],
    },
    ...overrides,
  });
}

function setupDeferredApi() {
  const calls = [];
  global.JaAlchemyApiService = class JaAlchemyApiService {
    async generateResponseStream(selectedText, promptVariant, context, onChunk, onDone, onError, options) {
      return new Promise((resolve) => {
        calls.push({
          selectedText,
          promptVariant,
          context,
          onChunk,
          onDone,
          onError,
          options,
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

  test('shows the pending selected text before analysis is confirmed', async () => {
    const { pendingSelectionStatus } = setupElements();
    const selectedText = '日'.repeat(500);
    setupStorage({
      selectedText,
      contextBefore: '私は',
      contextAfter: '毎日続けています。',
    });

    await handleSidepanelStorageChanges({ selectedText: { newValue: selectedText } });

    expect(pendingSelectionStatus.textContent).toContain(selectedText);
    expect(pendingSelectionStatus.textContent).toContain('開始分析');
  });

  test('includes the parsed structured analysis in a page save payload', async () => {
    const cacheKey = buildContextCacheKey({ selectedText: '成長', promptVariant: 'v2' });
    setupLocalStorage({ lastAnalysisResult: completedProjection(cacheKey) });
    setupElements();
    global.chrome.tabs = { query: jest.fn(async () => [{ url: 'https://example.com/article' }]) };
    const saved = [];
    global.JaAlchemyApiService = class JaAlchemyApiService {
      async saveAnalysis(analysis) {
        saved.push(analysis);
        return { success: true };
      }
    };

    await analizingSelectedText('成長', {}, { promptVariant: 'v2' });
    await handleSaveForLater();

    expect(saved).toHaveLength(1);
    expect(saved[0].page.structured_json).toEqual({
      words: [{ term: '成長', detail: 'growth' }],
      grammars: [],
    });
  });

  test('mode switch persists v1 without starting analysis for the current selection', async () => {
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
    expect(result.classList.contains('show')).toBe(true);
    expect(prose.innerHTML).toContain('cached v2 response');
    expect(apiCalls).toHaveLength(0);
    await changePromise;
  });

  test('persists a versioned completed-result projection and restores it without another stream', async () => {
    const text = '成長を後押しする';
    const context = { before: '制度が', after: 'という。' };
    const apiCalls = setupDeferredApi();
    const initialRequest = analizingSelectedText(text, context, { promptVariant: 'v2' });
    await flushMicrotasks();

    apiCalls[0].onDone('### 單字分析\n#### <單字>成長\ngrowth');
    apiCalls[0].resolve();
    await initialRequest;

    const cachedProjection = JSON.parse(global.localStorage.getItem('lastAnalysisResult'));
    expect(cachedProjection).toEqual(expect.objectContaining({
      version: 1,
      cacheKey: global.localStorage.getItem('lastAnalysisKey'),
      response: expect.stringContaining('成長'),
      json: expect.objectContaining({
        words: [{ term: '成長', detail: 'growth' }],
      }),
    }));

    const { copyButton, prose, result, saveAsBtn, saveForLaterBtn } = setupElements();
    await analizingSelectedText(text, context, { promptVariant: 'v2' });

    expect(apiCalls).toHaveLength(1);
    expect(prose.innerHTML).toContain('成長');
    expect(result.classList.contains('show')).toBe(true);
    expect(copyButton.disabled).toBe(false);
    expect(saveAsBtn.disabled).toBe(false);
    expect(saveForLaterBtn.disabled).toBe(false);
  });

  test('a malformed completed-result projection falls back to matching canonical markdown', async () => {
    const text = '成長を後押しする';
    const context = { before: '制度が', after: 'という。' };
    const cacheKey = buildContextCacheKey({ selectedText: text, context, promptVariant: 'v2' });
    const apiCalls = setupDeferredApi();
    setupLocalStorage({
      lastAnalysisKey: cacheKey,
      lastResponse: '### 單字分析\n#### <單字>成長\ngrowth',
      lastAnalysisResult: '{not valid JSON',
    });
    const { prose } = setupElements();

    await analizingSelectedText(text, context, { promptVariant: 'v2' });

    expect(apiCalls).toHaveLength(0);
    expect(prose.innerHTML).toContain('成長');
    expect(JSON.parse(global.localStorage.getItem('lastAnalysisResult'))).toEqual(expect.objectContaining({
      version: 1,
      cacheKey,
    }));
  });

  test('restores a valid word-only projection without canonical markdown fallback', async () => {
    const text = '成長を後押しする';
    const cacheKey = buildContextCacheKey({ selectedText: text, promptVariant: 'v2' });
    const apiCalls = setupDeferredApi();
    setupLocalStorage({ lastAnalysisResult: completedProjection(cacheKey) });
    const { prose, result } = setupElements();

    await analizingSelectedText(text, {}, { promptVariant: 'v2' });

    expect(apiCalls).toHaveLength(0);
    expect(prose.innerHTML).toContain('成長');
    expect(result.classList.contains('show')).toBe(true);
  });

  test('a matching cache key without a valid projection or canonical result clears stale output and streams', async () => {
    const text = '成長を後押しする';
    const cacheKey = buildContextCacheKey({ selectedText: text, promptVariant: 'v2' });
    const apiCalls = setupDeferredApi();
    setupLocalStorage({
      lastAnalysisKey: cacheKey,
      lastAnalysisResult: '{not valid JSON',
    });
    const { loading, prose, result } = setupElements();

    const request = analizingSelectedText(text, {}, { promptVariant: 'v2' });
    await flushMicrotasks();

    expect(apiCalls).toHaveLength(1);
    expect(prose.innerHTML).toBe('');
    expect(result.classList.contains('show')).toBe(false);
    expect(loading.classList.contains('show')).toBe(true);

    apiCalls[0].onError('unavailable');
    apiCalls[0].resolve();
    await request;
  });

  test('manually stops an active analysis before the first chunk without creating a result', async () => {
    const apiCalls = setupDeferredApi();
    const {
      cancelAnalysisButton,
      copyButton,
      elements,
      loading,
      result,
      saveAsBtn,
      saveForLaterBtn,
    } = setupElements();

    const request = analizingSelectedText('成長を後押しする', {}, { promptVariant: 'v2' });
    await flushMicrotasks();

    expect(cancelAnalysisButton.hidden).toBe(false);
    expect(loading.classList.contains('show')).toBe(true);

    handleCancelAnalysis(elements);

    expect(apiCalls[0].options.signal.aborted).toBe(true);
    expect(cancelAnalysisButton.hidden).toBe(true);
    expect(loading.classList.contains('show')).toBe(false);
    expect(result.classList.contains('show')).toBe(false);
    expect(copyButton.disabled).toBe(true);
    expect(saveAsBtn.disabled).toBe(true);
    expect(saveForLaterBtn.disabled).toBe(true);
    expect(global.localStorage.getItem('lastAnalysisResult')).toBeNull();

    apiCalls[0].onDone('# stale response');
    apiCalls[0].resolve();
    await request;
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
