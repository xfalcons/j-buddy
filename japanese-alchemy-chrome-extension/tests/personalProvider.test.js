import {
  ANALYSIS_PROVIDER_MODE_KEY,
  CHAT_COMPLETIONS_PROTOCOL,
  MANAGED_PROVIDER_MODE,
  PERSONAL_PROVIDER_MODE,
  PERSONAL_PROVIDER_CATALOG_KEY_PREFIX,
  PERSONAL_PROVIDER_CATALOG_REF_KEY,
  PERSONAL_PROVIDER_MODEL_SOURCE_KEY,
  PERSONAL_PROVIDER_PROFILE_KEY,
  PERSONAL_PROVIDER_REVISION_KEY,
  CATALOG_MODEL_SOURCE,
  MANUAL_MODEL_SOURCE,
  RESPONSES_PROTOCOL,
  clearPersonalProvider,
  getOriginPermission,
  getPersonalProviderState,
  normalizeApiBaseUrl,
  persistPersonalProviderModelCatalog,
  requestPersonalProviderOriginPermission,
  savePersonalProvider,
  setAnalysisProviderMode,
} from '../src/scripts/personalProvider.js';

function setupChrome(initial = {}, permittedOrigins = []) {
  const store = { ...initial };
  const permissions = new Set(permittedOrigins);

  global.chrome = {
    storage: {
      local: {
        get: jest.fn(async (keys) => {
          const requested = Array.isArray(keys) ? keys : [keys];
          return requested.reduce((result, key) => {
            result[key] = store[key];
            return result;
          }, {});
        }),
        set: jest.fn(async (values) => Object.assign(store, values)),
        remove: jest.fn(async (keys) => {
          for (const key of keys) delete store[key];
        }),
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

const profile = {
  apiUrl: 'https://api.example.test/v1/',
  apiKey: 'personal-secret-key',
  model: 'example-model',
};

describe('personal provider state', () => {
  beforeEach(() => {
    setupChrome();
  });

  test('normalizes an HTTPS API base and rejects unsafe URL components', () => {
    expect(normalizeApiBaseUrl(' https://API.example.test/v1/// '))
      .toBe('https://api.example.test/v1');
    expect(getOriginPermission('https://api.example.test/v1/'))
      .toBe('https://api.example.test/*');

    for (const unsafeUrl of [
      'http://api.example.test/v1',
      'https://user:pass@api.example.test/v1',
      'https://api.example.test/v1?key=nope',
      'https://api.example.test/v1#fragment',
    ]) {
      expect(() => normalizeApiBaseUrl(unsafeUrl)).toThrow('API 網址');
    }
  });

  test('first run persists managed mode and has no personal provider', async () => {
    const { store } = setupChrome();

    const state = await getPersonalProviderState();

    expect(state).toEqual(expect.objectContaining({
      mode: MANAGED_PROVIDER_MODE,
      profile: null,
      revision: 0,
      isPersonalReady: false,
    }));
    expect(store[ANALYSIS_PROVIDER_MODE_KEY]).toBe(MANAGED_PROVIDER_MODE);
    expect(global.chrome.storage.local.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
  });

  test('normalizes legacy profiles to Chat Completions-compatible and preserves Responses-compatible profiles', async () => {
    setupChrome({
      [PERSONAL_PROVIDER_PROFILE_KEY]: profile,
    }, ['https://api.example.test/*']);

    await expect(getPersonalProviderState()).resolves.toEqual(expect.objectContaining({
      profile: expect.objectContaining({ protocol: CHAT_COMPLETIONS_PROTOCOL }),
    }));

    await expect(savePersonalProvider({ ...profile, protocol: RESPONSES_PROTOCOL })).resolves.toEqual(
      expect.objectContaining({
        profile: expect.objectContaining({ protocol: RESPONSES_PROTOCOL }),
      })
    );
  });

  test('stores Responses model source beside the transport profile', async () => {
    const { store } = setupChrome();
    const responsesProfile = { ...profile, protocol: RESPONSES_PROTOCOL };

    const manual = await savePersonalProvider(responsesProfile, null, null, MANUAL_MODEL_SOURCE);
    expect(manual.profile).not.toHaveProperty('modelSource');
    expect(store[PERSONAL_PROVIDER_PROFILE_KEY]).not.toHaveProperty('modelSource');
    expect(store[PERSONAL_PROVIDER_MODEL_SOURCE_KEY]).toBe(MANUAL_MODEL_SOURCE);
    await expect(getPersonalProviderState()).resolves.toEqual(expect.objectContaining({
      profile: manual.profile,
      modelSource: MANUAL_MODEL_SOURCE,
    }));

    const catalog = await savePersonalProvider(
      responsesProfile,
      null,
      ['example-model'],
      CATALOG_MODEL_SOURCE
    );
    expect(catalog.profile).not.toHaveProperty('modelSource');
    expect(store[PERSONAL_PROVIDER_MODEL_SOURCE_KEY]).toBe(CATALOG_MODEL_SOURCE);
  });

  test('infers legacy Responses model source from an applicable catalog containing the saved model', async () => {
    const responsesProfile = {
      apiUrl: 'https://api.example.test/v1',
      apiKey: 'personal-secret-key',
      model: 'example-model',
      protocol: RESPONSES_PROTOCOL,
    };
    setupChrome({
      [PERSONAL_PROVIDER_PROFILE_KEY]: responsesProfile,
      [PERSONAL_PROVIDER_REVISION_KEY]: 4,
      [PERSONAL_PROVIDER_CATALOG_REF_KEY]: {
        version: 1,
        generation: 4,
        status: 'available',
      },
      [`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}4`]: {
        version: 1,
        generation: 4,
        apiUrl: responsesProfile.apiUrl,
        protocol: RESPONSES_PROTOCOL,
        modelIds: ['other-model', 'example-model'],
      },
    }, ['https://api.example.test/*']);

    await expect(getPersonalProviderState()).resolves.toEqual(expect.objectContaining({
      modelSource: CATALOG_MODEL_SOURCE,
    }));
  });

  test('infers a legacy Responses model without a matching catalog as manual', async () => {
    setupChrome({
      [PERSONAL_PROVIDER_PROFILE_KEY]: {
        apiUrl: 'https://api.example.test/v1',
        apiKey: 'personal-secret-key',
        model: 'manual-model',
        protocol: RESPONSES_PROTOCOL,
      },
      [PERSONAL_PROVIDER_REVISION_KEY]: 4,
    }, ['https://api.example.test/*']);

    await expect(getPersonalProviderState()).resolves.toEqual(expect.objectContaining({
      modelSource: MANUAL_MODEL_SOURCE,
    }));
  });

  test('materializes an explicit absent catalog reference for an existing saved generation', async () => {
    const { store } = setupChrome({
      [PERSONAL_PROVIDER_PROFILE_KEY]: {
        apiUrl: 'https://api.example.test/v1',
        apiKey: 'personal-secret-key',
        model: 'example-model',
        protocol: CHAT_COMPLETIONS_PROTOCOL,
      },
      [PERSONAL_PROVIDER_REVISION_KEY]: 7,
    }, ['https://api.example.test/*']);

    await expect(getPersonalProviderState()).resolves.toEqual(expect.objectContaining({
      revision: 7,
      modelCatalog: null,
    }));
    expect(store[PERSONAL_PROVIDER_CATALOG_REF_KEY]).toEqual({
      version: 1,
      generation: 7,
      status: 'absent',
    });
  });

  test('saves only after it obtains the exact provider origin permission', async () => {
    const { store } = setupChrome();

    const saved = await savePersonalProvider(profile);

    expect(global.chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://api.example.test/*'],
    });
    expect(saved).toEqual({
      profile: {
        apiUrl: 'https://api.example.test/v1',
        apiKey: 'personal-secret-key',
        model: 'example-model',
        protocol: CHAT_COMPLETIONS_PROTOCOL,
      },
      revision: 1,
    });
    expect(store).toEqual(expect.objectContaining({
      [PERSONAL_PROVIDER_PROFILE_KEY]: saved.profile,
      [PERSONAL_PROVIDER_REVISION_KEY]: 1,
      [PERSONAL_PROVIDER_CATALOG_REF_KEY]: {
        version: 1,
        generation: 1,
        status: 'absent',
      },
    }));
    expect(global.chrome.storage.sync).toBeUndefined();
  });

  test('round-trips a versioned catalog for the saved profile without copying credentials', async () => {
    const { store } = setupChrome();

    await savePersonalProvider(profile, null, ['model-b', 'example-model', 'model-a']);
    const state = await getPersonalProviderState();

    expect(state.modelCatalog).toEqual({
      modelIds: ['model-b', 'example-model', 'model-a'],
    });
    expect(store[PERSONAL_PROVIDER_CATALOG_REF_KEY]).toEqual({
      version: 1,
      generation: 1,
      status: 'available',
    });
    expect(store[`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}1`]).toEqual({
      version: 1,
      generation: 1,
      apiUrl: 'https://api.example.test/v1',
      protocol: CHAT_COMPLETIONS_PROTOCOL,
      modelIds: ['model-b', 'example-model', 'model-a'],
    });
    const rawCatalog = JSON.stringify(store[`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}1`]);
    expect(rawCatalog).not.toContain('personal-secret-key');
    expect(rawCatalog).not.toContain('apiKey');
  });

  test('replaces the current generation catalog without resaving or changing the profile', async () => {
    const { store } = setupChrome();
    const saved = await savePersonalProvider(profile, null, ['old-model', 'example-model']);

    await expect(persistPersonalProviderModelCatalog({
      generation: saved.revision,
      connection: saved.profile,
      modelIds: ['new-model', 'example-model'],
    })).resolves.toBe(true);

    expect(store[PERSONAL_PROVIDER_REVISION_KEY]).toBe(1);
    expect(store[PERSONAL_PROVIDER_PROFILE_KEY]).toEqual(saved.profile);
    expect(store[PERSONAL_PROVIDER_CATALOG_REF_KEY]).toEqual({
      version: 1,
      generation: 1,
      status: 'available',
    });
    expect(store[`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}1`]).toEqual({
      version: 1,
      generation: 1,
      apiUrl: 'https://api.example.test/v1',
      protocol: CHAT_COMPLETIONS_PROTOCOL,
      modelIds: ['new-model', 'example-model'],
    });
  });

  test('does not persist a refreshed catalog for a different saved connection', async () => {
    const { store } = setupChrome();
    const saved = await savePersonalProvider(profile, null, ['old-model']);
    const priorStore = structuredClone(store);

    await expect(persistPersonalProviderModelCatalog({
      generation: saved.revision,
      connection: { ...saved.profile, apiKey: 'edited-secret-key' },
      modelIds: ['edited-model'],
    })).resolves.toBe(false);

    expect(store).toEqual(priorStore);
  });

  test('a stale refresh cannot overwrite a newer saved generation catalog', async () => {
    const { store } = setupChrome();
    const first = await savePersonalProvider(profile, null, ['first-catalog']);
    let releaseStaleWrite;
    let staleWriteStarted;
    const staleWriteReady = new Promise((resolve) => { staleWriteStarted = resolve; });
    const originalSet = global.chrome.storage.local.set;
    global.chrome.storage.local.set = jest.fn(async (values) => {
      const oldCatalogKey = `${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}${first.revision}`;
      if (Object.keys(values).length === 1 && values[oldCatalogKey]) {
        staleWriteStarted();
        await new Promise((resolve) => { releaseStaleWrite = resolve; });
      }
      return originalSet(values);
    });

    const stalePersistence = persistPersonalProviderModelCatalog({
      generation: first.revision,
      connection: first.profile,
      modelIds: ['stale-catalog'],
    });
    await staleWriteReady;
    const second = await savePersonalProvider(profile, null, ['newer-catalog']);
    releaseStaleWrite();

    await expect(stalePersistence).resolves.toBe(false);
    expect(store[PERSONAL_PROVIDER_REVISION_KEY]).toBe(second.revision);
    expect(store[PERSONAL_PROVIDER_CATALOG_REF_KEY]).toEqual({
      version: 1,
      generation: second.revision,
      status: 'available',
    });
    expect(store[`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}${second.revision}`].modelIds)
      .toEqual(['newer-catalog']);
    expect(store[`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}${first.revision}`]).toBeUndefined();
  });

  test('clear and recreate of the same connection rejects the earlier incarnation refresh', async () => {
    const { store } = setupChrome();
    const first = await savePersonalProvider(profile);
    let releaseStaleWrite;
    let staleWriteStarted;
    const staleWriteReady = new Promise((resolve) => { staleWriteStarted = resolve; });
    const originalSet = global.chrome.storage.local.set;
    global.chrome.storage.local.set = jest.fn(async (values) => {
      const oldCatalogKey = `${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}${first.revision}`;
      if (Object.keys(values).length === 1 && values[oldCatalogKey]) {
        staleWriteStarted();
        await new Promise((resolve) => { releaseStaleWrite = resolve; });
      }
      return originalSet(values);
    });

    const stalePersistence = persistPersonalProviderModelCatalog({
      generation: first.revision,
      connection: first.profile,
      modelIds: ['stale-catalog'],
    });
    await staleWriteReady;
    await clearPersonalProvider();
    const recreated = await savePersonalProvider(profile, null, ['current-catalog']);
    releaseStaleWrite();

    await expect(stalePersistence).resolves.toBe(false);
    expect(recreated.revision).toBe(first.revision + 1);
    expect(store[PERSONAL_PROVIDER_CATALOG_REF_KEY].generation).toBe(recreated.revision);
    expect(store[`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}${recreated.revision}`].modelIds)
      .toEqual(['current-catalog']);
    expect(store[`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}${first.revision}`]).toBeUndefined();
  });

  test('an absent saved generation becomes readable when refresh writes only its owned payload', async () => {
    const { store } = setupChrome();
    const saved = await savePersonalProvider(profile);

    await expect(persistPersonalProviderModelCatalog({
      generation: saved.revision,
      connection: saved.profile,
      modelIds: ['refreshed-model'],
    })).resolves.toBe(true);

    expect(store[PERSONAL_PROVIDER_CATALOG_REF_KEY]).toEqual({
      version: 1,
      generation: saved.revision,
      status: 'absent',
    });
    await expect(getPersonalProviderState()).resolves.toEqual(expect.objectContaining({
      modelCatalog: { modelIds: ['refreshed-model'] },
    }));
  });

  test('concurrent refreshes for one generation use completion-order last-write-wins', async () => {
    const { store } = setupChrome();
    const saved = await savePersonalProvider(profile);
    const originalSet = global.chrome.storage.local.set;
    const releases = [];
    let writesStarted = 0;
    let bothWritesStarted;
    const ready = new Promise((resolve) => { bothWritesStarted = resolve; });
    global.chrome.storage.local.set = jest.fn(async (values) => {
      const key = `${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}${saved.revision}`;
      if (Object.keys(values).length === 1 && values[key]) {
        const writeIndex = writesStarted++;
        if (writesStarted === 2) bothWritesStarted();
        await new Promise((resolve) => { releases[writeIndex] = resolve; });
      }
      return originalSet(values);
    });

    const first = persistPersonalProviderModelCatalog({
      generation: saved.revision,
      connection: saved.profile,
      modelIds: ['first-completion'],
    });
    const second = persistPersonalProviderModelCatalog({
      generation: saved.revision,
      connection: saved.profile,
      modelIds: ['second-completion'],
    });
    await ready;
    releases[1]();
    await second;
    releases[0]();
    await first;

    expect(store[`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}${saved.revision}`].modelIds)
      .toEqual(['first-completion']);
  });

  test('carries a catalog across the same connection and drops it for a replacement connection', async () => {
    const { store } = setupChrome();
    await savePersonalProvider(profile, null, ['model-b', 'example-model']);

    await savePersonalProvider({ ...profile, model: 'model-b' });
    await expect(getPersonalProviderState()).resolves.toEqual(expect.objectContaining({
      revision: 2,
      modelCatalog: { modelIds: ['model-b', 'example-model'] },
    }));
    expect(store[`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}2`]).toEqual(expect.objectContaining({
      generation: 2,
      modelIds: ['model-b', 'example-model'],
    }));

    await savePersonalProvider({
      ...profile,
      apiKey: 'replacement-secret-key',
    });
    await expect(getPersonalProviderState()).resolves.toEqual(expect.objectContaining({
      revision: 3,
      modelCatalog: null,
    }));
    expect(store[PERSONAL_PROVIDER_CATALOG_REF_KEY]).toEqual({
      version: 1,
      generation: 3,
      status: 'absent',
    });
  });

  test('ignores malformed or mismatched catalog records without harming the saved profile', async () => {
    const normalizedProfile = {
      apiUrl: 'https://api.example.test/v1',
      apiKey: 'personal-secret-key',
      model: 'example-model',
      protocol: CHAT_COMPLETIONS_PROTOCOL,
    };
    const { store } = setupChrome({
      [PERSONAL_PROVIDER_PROFILE_KEY]: normalizedProfile,
      [PERSONAL_PROVIDER_REVISION_KEY]: 4,
      [PERSONAL_PROVIDER_CATALOG_REF_KEY]: {
        version: 99,
        generation: 4,
        status: 'available',
      },
      [`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}4`]: {
        version: 1,
        generation: 4,
        apiUrl: 'https://other.example.test/v1',
        protocol: CHAT_COMPLETIONS_PROTOCOL,
        modelIds: ['wrong-model'],
        unexpected: 'provider residue',
      },
    }, ['https://api.example.test/*']);

    const unknownVersionState = await getPersonalProviderState();
    expect(unknownVersionState.profile).toEqual(normalizedProfile);
    expect(unknownVersionState.modelCatalog).toBeNull();

    store[PERSONAL_PROVIDER_CATALOG_REF_KEY].version = 1;
    const state = await getPersonalProviderState();

    expect(state.profile).toEqual(normalizedProfile);
    expect(state.modelCatalog).toBeNull();
  });

  test('starts the permission request before any asynchronous storage work when called from a form gesture', async () => {
    const events = [];
    global.chrome.storage.local.get.mockImplementation(async () => {
      events.push('storage-get');
      return {};
    });
    global.chrome.permissions.request.mockImplementation(async ({ origins }) => {
      events.push('permission-request');
      return true;
    });

    const pendingPermission = requestPersonalProviderOriginPermission(profile);
    await savePersonalProvider(profile, pendingPermission);

    expect(events).toEqual(expect.arrayContaining(['permission-request', 'storage-get']));
    expect(events.indexOf('permission-request')).toBeLessThan(events.indexOf('storage-get'));
  });

  test('denied initial setup preserves managed mode and does not persist credentials', async () => {
    const { store } = setupChrome();
    global.chrome.permissions.request.mockResolvedValue(false);

    await expect(savePersonalProvider(profile)).rejects.toMatchObject({
      code: 'origin_permission_denied',
    });

    expect(store[PERSONAL_PROVIDER_PROFILE_KEY]).toBeUndefined();
    expect(store[ANALYSIS_PROVIDER_MODE_KEY]).toBeUndefined();
  });

  test('keeps an explicit personal selection when profile access is revoked', async () => {
    const normalizedProfile = {
      apiUrl: 'https://api.example.test/v1',
      apiKey: 'personal-secret-key',
      model: 'example-model',
      protocol: CHAT_COMPLETIONS_PROTOCOL,
    };
    setupChrome({
      [ANALYSIS_PROVIDER_MODE_KEY]: PERSONAL_PROVIDER_MODE,
      [PERSONAL_PROVIDER_PROFILE_KEY]: normalizedProfile,
      [PERSONAL_PROVIDER_REVISION_KEY]: 3,
    });

    const state = await getPersonalProviderState();

    expect(state).toEqual(expect.objectContaining({
      mode: PERSONAL_PROVIDER_MODE,
      profile: normalizedProfile,
      revision: 3,
      isPersonalReady: false,
      personalError: expect.objectContaining({ code: 'origin_permission_missing' }),
    }));
    await expect(setAnalysisProviderMode(PERSONAL_PROVIDER_MODE)).rejects.toMatchObject({
      code: 'origin_permission_missing',
    });
  });

  test('replaces a profile only after new permission and releases its inactive origin', async () => {
    const previousProfile = {
      apiUrl: 'https://old.example.test/v1',
      apiKey: 'old-key',
      model: 'old-model',
    };
    const { store } = setupChrome({
      [PERSONAL_PROVIDER_PROFILE_KEY]: previousProfile,
      [PERSONAL_PROVIDER_REVISION_KEY]: 7,
    }, ['https://old.example.test/*']);

    await savePersonalProvider(profile);

    expect(store[PERSONAL_PROVIDER_REVISION_KEY]).toBe(8);
    expect(global.chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://api.example.test/*'],
    });
    expect(global.chrome.permissions.remove).toHaveBeenCalledWith({
      origins: ['https://old.example.test/*'],
    });
  });

  test('clearing credentials switches the route to managed and removes the active origin', async () => {
    const normalizedProfile = {
      apiUrl: 'https://api.example.test/v1',
      apiKey: 'personal-secret-key',
      model: 'example-model',
    };
    const { store } = setupChrome({
      [ANALYSIS_PROVIDER_MODE_KEY]: PERSONAL_PROVIDER_MODE,
      [PERSONAL_PROVIDER_PROFILE_KEY]: normalizedProfile,
      [PERSONAL_PROVIDER_REVISION_KEY]: 2,
    }, ['https://api.example.test/*']);

    await clearPersonalProvider();

    expect(store).toEqual({
      [ANALYSIS_PROVIDER_MODE_KEY]: MANAGED_PROVIDER_MODE,
      [PERSONAL_PROVIDER_REVISION_KEY]: 2,
    });
    expect(global.chrome.permissions.remove).toHaveBeenCalledWith({
      origins: ['https://api.example.test/*'],
    });
  });

  test('does not reuse a saved-profile generation after clear and recreate', async () => {
    const { store } = setupChrome({
      [ANALYSIS_PROVIDER_MODE_KEY]: PERSONAL_PROVIDER_MODE,
      [PERSONAL_PROVIDER_PROFILE_KEY]: profile,
      [PERSONAL_PROVIDER_REVISION_KEY]: 2,
    }, ['https://api.example.test/*']);

    await clearPersonalProvider();
    await savePersonalProvider(profile);

    expect(store[PERSONAL_PROVIDER_REVISION_KEY]).toBe(3);
    expect(store[PERSONAL_PROVIDER_CATALOG_REF_KEY]).toEqual({
      version: 1,
      generation: 3,
      status: 'absent',
    });
  });

  test('clearing a saved profile removes catalog reachability while preserving its generation', async () => {
    const { store } = setupChrome();
    await savePersonalProvider(profile, null, ['example-model']);

    await clearPersonalProvider();
    const state = await getPersonalProviderState();

    expect(state.profile).toBeNull();
    expect(state.modelCatalog).toBeNull();
    expect(state.revision).toBe(1);
    expect(store[PERSONAL_PROVIDER_CATALOG_REF_KEY]).toBeUndefined();
    expect(store[`${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}1`]).toBeDefined();
  });
});
