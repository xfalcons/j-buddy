/**
 * Device-local configuration for one learner-owned OpenAI-compatible provider.
 *
 * Personal credentials are deliberately kept in chrome.storage.local (never
 * sync storage).  Only extension pages and service workers may access that
 * storage area; content scripts continue to use the background selection relay.
 */

export const PERSONAL_PROVIDER_PROFILE_KEY = 'personalProviderProfile';
export const ANALYSIS_PROVIDER_MODE_KEY = 'analysisProviderMode';
export const PERSONAL_PROVIDER_REVISION_KEY = 'personalProviderRevision';
export const PERSONAL_PROVIDER_CATALOG_REF_KEY = 'personalProviderModelCatalogRef';
export const PERSONAL_PROVIDER_CATALOG_KEY_PREFIX = 'personalProviderModelCatalog:';

export const MANAGED_PROVIDER_MODE = 'managed';
export const PERSONAL_PROVIDER_MODE = 'personal';
export const CHAT_COMPLETIONS_PROTOCOL = 'chat_completions';
export const RESPONSES_PROTOCOL = 'responses';
export const VALID_PROVIDER_MODES = Object.freeze([
  MANAGED_PROVIDER_MODE,
  PERSONAL_PROVIDER_MODE,
]);
export const VALID_PERSONAL_PROVIDER_PROTOCOLS = Object.freeze([
  CHAT_COMPLETIONS_PROTOCOL,
  RESPONSES_PROTOCOL,
]);

const TRUSTED_CONTEXTS = 'TRUSTED_CONTEXTS';
const MODEL_CATALOG_VERSION = 1;
const CATALOG_AVAILABLE = 'available';
const CATALOG_ABSENT = 'absent';

export class PersonalProviderError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PersonalProviderError';
    this.code = code;
  }
}

export function isValidProviderMode(mode) {
  return VALID_PROVIDER_MODES.includes(mode);
}

export function normalizePersonalProviderProtocol(protocol) {
  if (protocol === undefined || protocol === null || protocol === '') {
    return CHAT_COMPLETIONS_PROTOCOL;
  }
  if (!VALID_PERSONAL_PROVIDER_PROTOCOLS.includes(protocol)) {
    throw new PersonalProviderError('個人提供者通訊協定無效。', 'invalid_protocol');
  }
  return protocol;
}

function requireLocalStorage() {
  const local = globalThis.chrome?.storage?.local;
  if (!local) {
    throw new PersonalProviderError('Chrome 本機儲存空間無法使用。', 'storage_unavailable');
  }
  return local;
}

function requirePermissions() {
  const permissions = globalThis.chrome?.permissions;
  if (!permissions?.contains || !permissions?.request || !permissions?.remove) {
    throw new PersonalProviderError('Chrome 主機權限無法使用。', 'permissions_unavailable');
  }
  return permissions;
}

/**
 * Prevent web-page content scripts from reading provider credentials in local
 * storage. Chrome extension pages and service workers remain trusted contexts.
 */
export async function restrictLocalStorageToTrustedContexts() {
  const local = requireLocalStorage();
  if (typeof local.setAccessLevel !== 'function') {
    throw new PersonalProviderError(
      '此 Chrome 版本無法保護個人提供者設定。',
      'storage_access_control_unavailable'
    );
  }
  await local.setAccessLevel({ accessLevel: TRUSTED_CONTEXTS });
}

export function normalizeApiBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PersonalProviderError('必須填寫 API 網址。', 'invalid_api_url');
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new PersonalProviderError('API 網址必須是有效的 HTTPS 網址。', 'invalid_api_url');
  }

  if (url.protocol !== 'https:' || !url.hostname) {
    throw new PersonalProviderError('API 網址必須使用 HTTPS。', 'invalid_api_url');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new PersonalProviderError(
      'API 網址不可包含帳密、查詢字串或片段識別碼。',
      'invalid_api_url'
    );
  }

  // The transport adds /chat/completions. Keep a provider's version path but
  // collapse redundant/trailing separators so state and permission comparisons
  // are stable across equivalent entries.
  const normalizedPath = url.pathname
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '');
  return `${url.origin}${normalizedPath}`;
}

export function getOriginPermission(apiUrl) {
  const normalizedApiUrl = normalizeApiBaseUrl(apiUrl);
  return `${new URL(normalizedApiUrl).origin}/*`;
}

export function normalizePersonalProviderProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new PersonalProviderError('個人提供者設定不完整。', 'invalid_profile');
  }

  const apiKey = typeof profile.apiKey === 'string' ? profile.apiKey.trim() : '';
  const model = typeof profile.model === 'string' ? profile.model.trim() : '';
  if (!apiKey || !model) {
    throw new PersonalProviderError('必須填寫 API 金鑰與模型。', 'invalid_profile');
  }

  return Object.freeze({
    apiUrl: normalizeApiBaseUrl(profile.apiUrl),
    apiKey,
    model,
    protocol: normalizePersonalProviderProtocol(profile.protocol),
  });
}

export function normalizePersonalProviderConnection(connection) {
  if (!connection || typeof connection !== 'object' || Array.isArray(connection)) {
    throw new PersonalProviderError('個人提供者設定不完整。', 'invalid_connection');
  }

  const apiKey = typeof connection.apiKey === 'string' ? connection.apiKey.trim() : '';
  if (!apiKey) {
    throw new PersonalProviderError('必須填寫 API 金鑰。', 'invalid_connection');
  }

  return Object.freeze({
    apiUrl: normalizeApiBaseUrl(connection.apiUrl),
    apiKey,
    protocol: normalizePersonalProviderProtocol(connection.protocol),
  });
}

function normalizeRevision(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function getModelCatalogStorageKey(generation) {
  return `${PERSONAL_PROVIDER_CATALOG_KEY_PREFIX}${generation}`;
}

function normalizeModelIds(modelIds) {
  if (!Array.isArray(modelIds) || modelIds.length === 0) return null;
  const normalized = [];
  const seen = new Set();
  for (const modelId of modelIds) {
    if (typeof modelId !== 'string' || !modelId.trim()) return null;
    const value = modelId.trim();
    if (!seen.has(value)) {
      seen.add(value);
      normalized.push(value);
    }
  }
  return normalized.length ? Object.freeze(normalized) : null;
}

function hasOnlyKeys(value, allowedKeys) {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function connectionsMatch(first, second) {
  return first?.apiUrl === second?.apiUrl
    && first?.apiKey === second?.apiKey
    && first?.protocol === second?.protocol;
}

async function readStoredModelCatalog(stored, profile, generation) {
  const ref = stored?.[PERSONAL_PROVIDER_CATALOG_REF_KEY];
  if (!profile || !generation || !ref || typeof ref !== 'object' || Array.isArray(ref)) return null;
  if (!hasOnlyKeys(ref, ['version', 'generation', 'status'])) return null;
  if (ref.version !== MODEL_CATALOG_VERSION || ref.generation !== generation) return null;
  if (ref.status === CATALOG_ABSENT) return null;
  if (ref.status !== CATALOG_AVAILABLE) return null;

  const storageKey = getModelCatalogStorageKey(generation);
  const catalogValues = await requireLocalStorage().get([storageKey]);
  const catalog = catalogValues?.[storageKey];
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) return null;
  if (!hasOnlyKeys(catalog, ['version', 'generation', 'apiUrl', 'protocol', 'modelIds'])) return null;
  const modelIds = normalizeModelIds(catalog.modelIds);
  if (!modelIds || modelIds.length !== catalog.modelIds.length) return null;
  if (catalog.version !== MODEL_CATALOG_VERSION
      || catalog.generation !== generation
      || catalog.apiUrl !== profile.apiUrl
      || catalog.protocol !== profile.protocol) {
    return null;
  }
  return Object.freeze({ modelIds });
}

async function getStoredProviderValues() {
  await restrictLocalStorageToTrustedContexts();
  return requireLocalStorage().get([
    PERSONAL_PROVIDER_PROFILE_KEY,
    ANALYSIS_PROVIDER_MODE_KEY,
    PERSONAL_PROVIDER_REVISION_KEY,
    PERSONAL_PROVIDER_CATALOG_REF_KEY,
  ]);
}

async function readProfileReadiness(profile) {
  try {
    const normalizedProfile = normalizePersonalProviderProfile(profile);
    const permission = getOriginPermission(normalizedProfile.apiUrl);
    const hasOriginPermission = await requirePermissions().contains({ origins: [permission] });
    return {
      profile: normalizedProfile,
      permission,
      ready: Boolean(hasOriginPermission),
      error: hasOriginPermission ? null : new PersonalProviderError(
        '使用個人分析前，請先允許存取此提供者。',
        'origin_permission_missing'
      ),
    };
  } catch (error) {
    return {
      profile: null,
      permission: null,
      ready: false,
      error: error instanceof PersonalProviderError
        ? error
        : new PersonalProviderError('個人提供者設定無法使用。', 'invalid_profile'),
    };
  }
}

/**
 * Read the persistent route without silently changing a selected personal mode.
 * A malformed/revoked profile therefore remains visibly personal and callers can
 * block the request with the returned readiness error instead of falling back.
 */
export async function getPersonalProviderState() {
  const stored = await getStoredProviderValues();
  const mode = isValidProviderMode(stored?.[ANALYSIS_PROVIDER_MODE_KEY])
    ? stored[ANALYSIS_PROVIDER_MODE_KEY]
    : MANAGED_PROVIDER_MODE;

  // Make first-run and corrupted-route recovery durable. Do not change an
  // explicit personal selection merely because its profile is no longer ready.
  if (stored?.[ANALYSIS_PROVIDER_MODE_KEY] !== mode) {
    await requireLocalStorage().set({ [ANALYSIS_PROVIDER_MODE_KEY]: mode });
  }

  const readiness = await readProfileReadiness(stored?.[PERSONAL_PROVIDER_PROFILE_KEY]);
  const revision = normalizeRevision(stored?.[PERSONAL_PROVIDER_REVISION_KEY]);
  let catalogRef = stored?.[PERSONAL_PROVIDER_CATALOG_REF_KEY];
  if (readiness.profile && revision && catalogRef === undefined) {
    catalogRef = {
      version: MODEL_CATALOG_VERSION,
      generation: revision,
      status: CATALOG_ABSENT,
    };
    await requireLocalStorage().set({
      [PERSONAL_PROVIDER_CATALOG_REF_KEY]: catalogRef,
    });
  }
  const modelCatalog = catalogRef
    ? await readStoredModelCatalog({
      ...stored,
      [PERSONAL_PROVIDER_CATALOG_REF_KEY]: catalogRef,
    }, readiness.profile, revision)
    : null;
  return {
    mode,
    profile: readiness.profile,
    revision,
    modelCatalog,
    isPersonalReady: readiness.ready,
    personalError: readiness.error,
  };
}

export async function setAnalysisProviderMode(mode) {
  if (!isValidProviderMode(mode)) {
    throw new PersonalProviderError('分析提供者模式無效。', 'invalid_mode');
  }

  const state = await getPersonalProviderState();
  if (mode === PERSONAL_PROVIDER_MODE && !state.isPersonalReady) {
    throw state.personalError || new PersonalProviderError(
      '選取個人分析前，請先完成個人提供者設定。',
      'personal_provider_unavailable'
    );
  }

  await requireLocalStorage().set({ [ANALYSIS_PROVIDER_MODE_KEY]: mode });
  return mode;
}

/**
 * Start the host-permission prompt synchronously from the settings form's
 * submit gesture. Chrome can reject permission requests once an async storage
 * read has yielded, so the subsequent persistence step receives this promise.
 */
export function requestPersonalProviderConnectionPermission(connection) {
  const normalizedConnection = normalizePersonalProviderConnection(connection);
  const permission = getOriginPermission(normalizedConnection.apiUrl);
  const permissions = requirePermissions();
  return {
    normalizedConnection,
    permission,
    hadPermission: permissions.contains({ origins: [permission] }),
    permissionRequest: permissions.request({ origins: [permission] }),
  };
}

export function requestPersonalProviderOriginPermission(profile) {
  const normalizedProfile = normalizePersonalProviderProfile(profile);
  const pendingConnectionPermission = requestPersonalProviderConnectionPermission(normalizedProfile);
  return {
    ...pendingConnectionPermission,
    normalizedProfile,
  };
}

export async function releasePersonalProviderOriginPermission(permission) {
  if (typeof permission === 'string' && permission) {
    await requirePermissions().remove({ origins: [permission] });
  }
}

/**
 * Request the exact provider origin before saving a replacement profile. The
 * previous origin is released only after the new profile has committed.
 */
export async function savePersonalProvider(profile, pendingPermission = null, catalogModelIds = null) {
  const normalizedProfile = pendingPermission?.normalizedProfile
    || normalizePersonalProviderProfile(profile);
  const nextPermission = pendingPermission?.permission
    || getOriginPermission(normalizedProfile.apiUrl);
  const stored = await getStoredProviderValues();
  const currentReadiness = await readProfileReadiness(stored?.[PERSONAL_PROVIDER_PROFILE_KEY]);
  const previousPermission = currentReadiness.permission;
  const currentRevision = normalizeRevision(stored?.[PERSONAL_PROVIDER_REVISION_KEY]);
  const currentCatalog = await readStoredModelCatalog(
    stored,
    currentReadiness.profile,
    currentRevision
  );

  const permissions = requirePermissions();
  const granted = await (pendingPermission?.permissionRequest
    || permissions.request({ origins: [nextPermission] }));
  if (!granted) {
    throw new PersonalProviderError(
      '未取得提供者存取權，個人設定未儲存。',
      'origin_permission_denied'
    );
  }

  const suppliedModelIds = catalogModelIds === null
    ? null
    : normalizeModelIds(catalogModelIds);
  if (catalogModelIds !== null && !suppliedModelIds) {
    throw new PersonalProviderError('模型目錄無效。', 'invalid_model_catalog');
  }
  const modelIds = suppliedModelIds
    || (connectionsMatch(currentReadiness.profile, normalizedProfile)
      ? currentCatalog?.modelIds
      : null);
  const revision = currentRevision + 1;
  const catalogRef = {
    version: MODEL_CATALOG_VERSION,
    generation: revision,
    status: modelIds ? CATALOG_AVAILABLE : CATALOG_ABSENT,
  };
  const nextStoredValues = {
    [PERSONAL_PROVIDER_PROFILE_KEY]: normalizedProfile,
    [PERSONAL_PROVIDER_REVISION_KEY]: revision,
    [PERSONAL_PROVIDER_CATALOG_REF_KEY]: catalogRef,
  };
  if (modelIds) {
    nextStoredValues[getModelCatalogStorageKey(revision)] = {
      version: MODEL_CATALOG_VERSION,
      generation: revision,
      apiUrl: normalizedProfile.apiUrl,
      protocol: normalizedProfile.protocol,
      modelIds: [...modelIds],
    };
  }
  await requireLocalStorage().set(nextStoredValues);

  if (previousPermission && previousPermission !== nextPermission) {
    await permissions.remove({ origins: [previousPermission] });
  }

  return {
    profile: normalizedProfile,
    revision,
  };
}

/**
 * Explicitly clearing personal credentials always returns the persistent route
 * to managed analysis, then relinquishes the old origin permission.
 */
export async function clearPersonalProvider() {
  const stored = await getStoredProviderValues();
  const readiness = await readProfileReadiness(stored?.[PERSONAL_PROVIDER_PROFILE_KEY]);

  await requireLocalStorage().set({ [ANALYSIS_PROVIDER_MODE_KEY]: MANAGED_PROVIDER_MODE });
  await requireLocalStorage().remove([
    PERSONAL_PROVIDER_PROFILE_KEY,
    PERSONAL_PROVIDER_CATALOG_REF_KEY,
  ]);

  if (readiness.permission) {
    await requirePermissions().remove({ origins: [readiness.permission] });
  }

  return MANAGED_PROVIDER_MODE;
}
