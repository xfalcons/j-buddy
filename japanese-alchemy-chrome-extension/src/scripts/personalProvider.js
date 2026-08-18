import { normalizeModelCatalogIds } from './modelCatalog.js';

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
export const PERSONAL_PROVIDER_MODEL_SOURCE_KEY = 'personalProviderModelSource';
export const PERSONAL_PROVIDER_PENDING_PERMISSION_CLEANUP_KEY = 'personalProviderPendingPermissionCleanup';

export const MANAGED_PROVIDER_MODE = 'managed';
export const PERSONAL_PROVIDER_MODE = 'personal';
export const CHAT_COMPLETIONS_PROTOCOL = 'chat_completions';
export const RESPONSES_PROTOCOL = 'responses';
export const CATALOG_MODEL_SOURCE = 'catalog';
export const MANUAL_MODEL_SOURCE = 'manual';
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
const MAX_PENDING_PERMISSION_CLEANUP_ORIGINS = 32;
const MAX_CATALOG_GC_RECORDS = 32;
const PROVIDER_MUTATION_LOCK = 'j-buddy-personal-provider-state';
let providerMutationQueue = Promise.resolve();

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

function withProviderMutationLock(task) {
  if (globalThis.navigator?.locks?.request) {
    return globalThis.navigator.locks.request(PROVIDER_MUTATION_LOCK, task);
  }
  const result = providerMutationQueue.then(task, task);
  providerMutationQueue = result.catch(() => undefined);
  return result;
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

function normalizePendingPermissionOrigins(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((origin) => {
    if (typeof origin !== 'string' || !origin.endsWith('/*')) return false;
    try {
      return getOriginPermission(origin.slice(0, -2)) === origin;
    } catch {
      return false;
    }
  }))].slice(0, MAX_PENDING_PERMISSION_CLEANUP_ORIGINS);
}

function nextPendingPermissionOrigins(storedValue, obsoletePermission, activePermission) {
  const pending = normalizePendingPermissionOrigins(storedValue)
    .filter((permission) => permission !== activePermission);
  if (obsoletePermission
      && obsoletePermission !== activePermission
      && !pending.includes(obsoletePermission)) {
    pending.push(obsoletePermission);
  }
  if (pending.length > MAX_PENDING_PERMISSION_CLEANUP_ORIGINS) {
    throw new PersonalProviderError(
      '尚有太多舊提供者權限等待清理，請稍後再試。',
      'permission_cleanup_capacity'
    );
  }
  return pending;
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

function normalizeModelIds(modelIds, options) {
  try {
    return normalizeModelCatalogIds(modelIds, options);
  } catch {
    return null;
  }
}

function hasOnlyKeys(value, allowedKeys) {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function connectionsMatch(first, second) {
  return first?.apiUrl === second?.apiUrl
    && first?.apiKey === second?.apiKey
    && first?.protocol === second?.protocol;
}

function resolveModelSource(profile, modelCatalog, storedSource) {
  if (!profile) return null;
  if (profile.protocol !== RESPONSES_PROTOCOL) return CATALOG_MODEL_SOURCE;
  if ([CATALOG_MODEL_SOURCE, MANUAL_MODEL_SOURCE].includes(storedSource)) {
    return storedSource;
  }
  return modelCatalog?.modelIds?.includes(profile.model)
    ? CATALOG_MODEL_SOURCE
    : MANUAL_MODEL_SOURCE;
}

async function readStoredModelCatalog(stored, profile, generation) {
  const ref = stored?.[PERSONAL_PROVIDER_CATALOG_REF_KEY];
  if (!profile || !generation || !ref || typeof ref !== 'object' || Array.isArray(ref)) return null;
  if (!hasOnlyKeys(ref, ['version', 'generation', 'status'])) return null;
  if (ref.version !== MODEL_CATALOG_VERSION || ref.generation !== generation) return null;
  if (![CATALOG_ABSENT, CATALOG_AVAILABLE].includes(ref.status)) return null;

  const storageKey = getModelCatalogStorageKey(generation);
  const catalogValues = await requireLocalStorage().get([storageKey]);
  const catalog = catalogValues?.[storageKey];
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) return null;
  if (!hasOnlyKeys(catalog, ['version', 'generation', 'apiUrl', 'protocol', 'modelIds'])) return null;
  const modelIds = normalizeModelIds(catalog.modelIds, { requireCanonical: true });
  if (!modelIds) return null;
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
    PERSONAL_PROVIDER_MODEL_SOURCE_KEY,
    PERSONAL_PROVIDER_PENDING_PERMISSION_CLEANUP_KEY,
  ]);
}

async function retryPendingPermissionCleanupUnlocked() {
  const stored = await getStoredProviderValues();
  let activePermission = null;
  try {
    activePermission = getOriginPermission(
      normalizePersonalProviderProfile(stored?.[PERSONAL_PROVIDER_PROFILE_KEY]).apiUrl
    );
  } catch {
    // A cleared or malformed profile has no active origin to retain.
  }
  const pending = normalizePendingPermissionOrigins(
    stored?.[PERSONAL_PROVIDER_PENDING_PERMISSION_CLEANUP_KEY]
  ).filter((permission) => permission !== activePermission);
  const remaining = [];
  for (const permission of pending) {
    try {
      const stillGranted = await requirePermissions().contains({ origins: [permission] });
      if (!stillGranted) continue;
      const removed = await requirePermissions().remove({ origins: [permission] });
      if (!removed) remaining.push(permission);
    } catch {
      remaining.push(permission);
    }
  }
  if (JSON.stringify(remaining) !== JSON.stringify(
    stored?.[PERSONAL_PROVIDER_PENDING_PERMISSION_CLEANUP_KEY] || []
  )) {
    try {
      await requireLocalStorage().set({
        [PERSONAL_PROVIDER_PENDING_PERMISSION_CLEANUP_KEY]: remaining,
      });
    } catch {
      return pending;
    }
  }
  return remaining;
}

async function garbageCollectModelCatalogsUnlocked({ clearAll = false } = {}) {
  const local = requireLocalStorage();
  const [stored, allStored] = await Promise.all([
    getStoredProviderValues(),
    local.get(null),
  ]);
  const currentRevision = normalizeRevision(stored?.[PERSONAL_PROVIDER_REVISION_KEY]);
  const currentRef = stored?.[PERSONAL_PROVIDER_CATALOG_REF_KEY];
  const hasCurrentProfile = Boolean(stored?.[PERSONAL_PROVIDER_PROFILE_KEY]);
  const reachableKey = hasCurrentProfile
      && currentRef?.version === MODEL_CATALOG_VERSION
      && currentRef?.generation === currentRevision
    ? getModelCatalogStorageKey(currentRevision)
    : null;
  const allCandidates = Object.keys(allStored || {})
    .filter((key) => key.startsWith(PERSONAL_PROVIDER_CATALOG_KEY_PREFIX))
    .filter((key) => key !== reachableKey);
  const candidates = clearAll
    ? allCandidates
    : allCandidates.slice(0, MAX_CATALOG_GC_RECORDS);
  if (!candidates.length) return [];
  try {
    await local.remove(candidates);
    return [];
  } catch {
    return candidates;
  }
}

async function runProviderMaintenanceUnlocked(options = {}) {
  let pendingPermissionCleanup = options.fallbackPendingPermissionCleanup || [];
  let pendingCatalogCleanup = [];
  try {
    pendingPermissionCleanup = await retryPendingPermissionCleanupUnlocked();
  } catch {
    // The canonical transition retains cleanup intent for a later retry.
  }
  try {
    pendingCatalogCleanup = await garbageCollectModelCatalogsUnlocked(options);
  } catch {
    pendingCatalogCleanup = ['retry-required'];
  }
  return { pendingPermissionCleanup, pendingCatalogCleanup };
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
export async function getPersonalProviderState({ performMaintenance = true } = {}) {
  const maintenance = performMaintenance
    ? await withProviderMutationLock(() => runProviderMaintenanceUnlocked())
    : { pendingCatalogCleanup: [] };
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
  const modelSource = resolveModelSource(
    readiness.profile,
    modelCatalog,
    stored?.[PERSONAL_PROVIDER_MODEL_SOURCE_KEY]
  );
  return {
    mode,
    profile: readiness.profile,
    revision,
    modelCatalog,
    modelSource,
    pendingPermissionCleanup: normalizePendingPermissionOrigins(
      stored?.[PERSONAL_PROVIDER_PENDING_PERMISSION_CLEANUP_KEY]
    ),
    hasPendingCatalogCleanup: maintenance.pendingCatalogCleanup.length > 0,
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
 * Persist model discovery for the current saved profile without creating a new
 * profile generation. Edited/new connections deliberately return false so the
 * side panel can keep their successful catalogs session-staged until Save.
 */
async function persistPersonalProviderModelCatalogUnlocked({ generation, connection, modelIds }) {
  const expectedGeneration = normalizeRevision(generation);
  const normalizedConnection = normalizePersonalProviderConnection(connection);
  const normalizedModelIds = normalizeModelIds(modelIds);
  if (!expectedGeneration || !normalizedModelIds) {
    throw new PersonalProviderError('模型目錄無效。', 'invalid_model_catalog');
  }

  const stored = await getStoredProviderValues();
  let currentProfile;
  try {
    currentProfile = normalizePersonalProviderProfile(stored?.[PERSONAL_PROVIDER_PROFILE_KEY]);
  } catch {
    return false;
  }
  const currentGeneration = normalizeRevision(stored?.[PERSONAL_PROVIDER_REVISION_KEY]);
  if (currentGeneration !== expectedGeneration
      || !connectionsMatch(currentProfile, normalizedConnection)) {
    return false;
  }

  await requireLocalStorage().set({
    [getModelCatalogStorageKey(expectedGeneration)]: {
      version: MODEL_CATALOG_VERSION,
      generation: expectedGeneration,
      apiUrl: normalizedConnection.apiUrl,
      protocol: normalizedConnection.protocol,
      modelIds: [...normalizedModelIds],
    },
  });

  const current = await getStoredProviderValues();
  let latestProfile = null;
  try {
    latestProfile = normalizePersonalProviderProfile(current?.[PERSONAL_PROVIDER_PROFILE_KEY]);
  } catch {
    // A cleared or replaced profile cannot own this generation's payload.
  }
  const latestRef = current?.[PERSONAL_PROVIDER_CATALOG_REF_KEY];
  const stillOwned = normalizeRevision(current?.[PERSONAL_PROVIDER_REVISION_KEY]) === expectedGeneration
    && latestRef?.version === MODEL_CATALOG_VERSION
    && latestRef?.generation === expectedGeneration
    && connectionsMatch(latestProfile, normalizedConnection);
  if (!stillOwned && latestRef?.generation !== expectedGeneration) {
    await requireLocalStorage().remove([getModelCatalogStorageKey(expectedGeneration)]);
  }
  return stillOwned;
}

export function persistPersonalProviderModelCatalog(catalog) {
  return persistPersonalProviderModelCatalogUnlocked(catalog);
}

/**
 * Request the exact provider origin before saving a replacement profile. The
 * previous origin becomes unreachable in the canonical state transition, then
 * remains in the bounded cleanup ledger until permission removal succeeds.
 */
async function savePersonalProviderUnlocked(
  profile,
  pendingPermission = null,
  catalogModelIds = null,
  requestedModelSource = null
) {
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
  const currentModelSource = resolveModelSource(
    currentReadiness.profile,
    currentCatalog,
    stored?.[PERSONAL_PROVIDER_MODEL_SOURCE_KEY]
  );
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
  let modelSource = CATALOG_MODEL_SOURCE;
  if (normalizedProfile.protocol === RESPONSES_PROTOCOL) {
    if ([CATALOG_MODEL_SOURCE, MANUAL_MODEL_SOURCE].includes(requestedModelSource)) {
      modelSource = requestedModelSource;
    } else if (suppliedModelIds?.includes(normalizedProfile.model)) {
      modelSource = CATALOG_MODEL_SOURCE;
    } else if (connectionsMatch(currentReadiness.profile, normalizedProfile)
        && currentReadiness.profile?.model === normalizedProfile.model
        && currentModelSource) {
      modelSource = currentModelSource;
    } else {
      modelSource = MANUAL_MODEL_SOURCE;
    }
  }
  if (modelSource === CATALOG_MODEL_SOURCE
      && normalizedProfile.protocol === RESPONSES_PROTOCOL
      && !modelIds?.includes(normalizedProfile.model)) {
    throw new PersonalProviderError('選取的模型不在模型目錄中。', 'invalid_model_source');
  }
  const pendingPermissionCleanup = nextPendingPermissionOrigins(
    stored?.[PERSONAL_PROVIDER_PENDING_PERMISSION_CLEANUP_KEY],
    previousPermission,
    nextPermission
  );
  const permissions = requirePermissions();
  const hadNextPermission = await (pendingPermission?.hadPermission
    || permissions.contains({ origins: [nextPermission] }));
  const granted = await (pendingPermission?.permissionRequest
    || permissions.request({ origins: [nextPermission] }));
  if (!granted) {
    throw new PersonalProviderError(
      '未取得提供者存取權，個人設定未儲存。',
      'origin_permission_denied'
    );
  }

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
    [PERSONAL_PROVIDER_MODEL_SOURCE_KEY]: modelSource,
    [PERSONAL_PROVIDER_PENDING_PERMISSION_CLEANUP_KEY]: pendingPermissionCleanup,
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
  try {
    await requireLocalStorage().set(nextStoredValues);
  } catch (error) {
    if (!hadNextPermission && nextPermission !== previousPermission) {
      try {
        await permissions.remove({ origins: [nextPermission] });
      } catch {
        // Preserve the storage failure as the primary error.
      }
    }
    throw error;
  }
  const maintenance = await runProviderMaintenanceUnlocked({
    fallbackPendingPermissionCleanup: pendingPermissionCleanup,
  });

  return {
    profile: normalizedProfile,
    revision,
    ...maintenance,
  };
}

export function savePersonalProvider(profile, pendingPermission, catalogModelIds, modelSource) {
  return withProviderMutationLock(() => savePersonalProviderUnlocked(
    profile,
    pendingPermission,
    catalogModelIds,
    modelSource
  ));
}

/**
 * Explicitly clearing personal credentials commits managed-route tombstones
 * before retrying obsolete permissions and unreachable catalog records.
 */
async function clearPersonalProviderUnlocked() {
  const stored = await getStoredProviderValues();
  const readiness = await readProfileReadiness(stored?.[PERSONAL_PROVIDER_PROFILE_KEY]);
  const revision = normalizeRevision(stored?.[PERSONAL_PROVIDER_REVISION_KEY]);
  const pendingPermissionCleanup = nextPendingPermissionOrigins(
    stored?.[PERSONAL_PROVIDER_PENDING_PERMISSION_CLEANUP_KEY],
    readiness.permission,
    null
  );

  await requireLocalStorage().set({
    [ANALYSIS_PROVIDER_MODE_KEY]: MANAGED_PROVIDER_MODE,
    [PERSONAL_PROVIDER_PROFILE_KEY]: null,
    [PERSONAL_PROVIDER_REVISION_KEY]: revision,
    [PERSONAL_PROVIDER_CATALOG_REF_KEY]: null,
    [PERSONAL_PROVIDER_MODEL_SOURCE_KEY]: null,
    [PERSONAL_PROVIDER_PENDING_PERMISSION_CLEANUP_KEY]: pendingPermissionCleanup,
  });
  const maintenance = await runProviderMaintenanceUnlocked({
    clearAll: true,
    fallbackPendingPermissionCleanup: pendingPermissionCleanup,
  });
  return { mode: MANAGED_PROVIDER_MODE, ...maintenance };
}

export function clearPersonalProvider() {
  return withProviderMutationLock(clearPersonalProviderUnlocked);
}
