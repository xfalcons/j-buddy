/**
 * Unit tests for getPromptVariant — the A/B prompt-variant resolver.
 * Mocks chrome.storage.local in isolation (no sidepanel.js / authService import).
 */
import {
  ANALYSIS_MODE_OPTIONS,
  getAnalysisModeForVariant,
  getPromptVariant,
  setPromptVariant,
} from '../src/scripts/promptVariant.js';

describe('getPromptVariant', () => {
  let store;

  beforeEach(() => {
    store = {};
    global.chrome = {
      storage: {
        local: {
          get: jest.fn(async (key) => ({ [key]: store[key] })),
          set: jest.fn(async (obj) => {
            Object.assign(store, obj);
          }),
        },
      },
    };
  });

  test('defaults to v2 and persists when not set', async () => {
    const variant = await getPromptVariant();

    expect(variant).toBe('v2');
    expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
      promptVariant: 'v2',
    });
  });

  test('returns v1 when stored without re-persisting', async () => {
    store.promptVariant = 'v1';

    const variant = await getPromptVariant();

    expect(variant).toBe('v1');
    expect(global.chrome.storage.local.set).not.toHaveBeenCalled();
  });

  test('returns v2 when stored without re-persisting', async () => {
    store.promptVariant = 'v2';

    const variant = await getPromptVariant();

    expect(variant).toBe('v2');
    expect(global.chrome.storage.local.set).not.toHaveBeenCalled();
  });

  test('resets an invalid stored value back to v2', async () => {
    store.promptVariant = 'v3';

    const variant = await getPromptVariant();

    expect(variant).toBe('v2');
    expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
      promptVariant: 'v2',
    });
  });

  test('exposes learner-facing analysis mode labels for prompt variants', () => {
    expect(ANALYSIS_MODE_OPTIONS).toEqual([
      expect.objectContaining({ variant: 'v1', label: '精簡分析' }),
      expect.objectContaining({ variant: 'v2', label: '造句分析' }),
    ]);
    expect(getAnalysisModeForVariant('v1').label).toBe('精簡分析');
    expect(getAnalysisModeForVariant('v2').label).toBe('造句分析');
    expect(getAnalysisModeForVariant('v3').label).toBe('造句分析');
  });

  test('persists a valid prompt variant selected from the analysis-mode UI', async () => {
    const variant = await setPromptVariant('v1');

    expect(variant).toBe('v1');
    expect(store.promptVariant).toBe('v1');
    expect(global.chrome.storage.local.set).toHaveBeenCalledWith({
      promptVariant: 'v1',
    });
  });

  test('rejects invalid prompt variants without mutating storage', async () => {
    store.promptVariant = 'v2';

    await expect(setPromptVariant('v3')).rejects.toThrow('Invalid prompt variant: v3');

    expect(store.promptVariant).toBe('v2');
    expect(global.chrome.storage.local.set).not.toHaveBeenCalled();
  });
});
