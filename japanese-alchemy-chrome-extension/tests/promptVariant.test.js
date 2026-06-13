/**
 * Unit tests for getPromptVariant — the A/B prompt-variant resolver.
 * Mocks chrome.storage.local in isolation (no sidepanel.js / authService import).
 */
import { getPromptVariant } from '../src/scripts/promptVariant.js';

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
});
