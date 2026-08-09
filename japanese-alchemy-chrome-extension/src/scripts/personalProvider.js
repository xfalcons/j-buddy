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

export const MANAGED_PROVIDER_MODE = 'managed';
export const PERSONAL_PROVIDER_MODE = 'personal';
export const VALID_PROVIDER_MODES = Object.freeze([
  MANAGED_PROVIDER_MODE,
  PERSONAL_PROVIDER_MODE,
]);

const TRUSTED_CONTEXTS = 'TRUSTED_CONTEXTS';

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

function requireLocalStorage() {
  const local = globalThis.chrome?.storage?.local;
  if (!local) {
    throw new PersonalProviderError('Chrome local storage is unavailable.', 'storage_unavailable');
  }
  return local;
}

function requirePermissions() {
  const permissions = globalThis.chrome?.permissions;
  if (!permissions?.contains || !permissions?.request || !permissions?.remove) {
    throw new PersonalProviderError('Chrome host permissions are unavailable.', 'permissions_unavailable');
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
      'This Chrome version cannot protect personal provider settings.',
      'storage_access_control_unavailable'
    );
  }
  await local.setAccessLevel({ accessLevel: TRUSTED_CONTEXTS });
}

export function normalizeApiBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PersonalProviderError('API URL is required.', 'invalid_api_url');
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new PersonalProviderError('API URL must be a valid HTTPS URL.', 'invalid_api_url');
  }

  if (url.protocol !== 'https:' || !url.hostname) {
    throw new PersonalProviderError('API URL must use HTTPS.', 'invalid_api_url');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new PersonalProviderError(
      'API URL cannot include credentials, a query string, or a fragment.',
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
    throw new PersonalProviderError('Personal provider setup is incomplete.', 'invalid_profile');
  }

  const apiKey = typeof profile.apiKey === 'string' ? profile.apiKey.trim() : '';
  const model = typeof profile.model === 'string' ? profile.model.trim() : '';
  if (!apiKey || !model) {
    throw new PersonalProviderError('API key and model are required.', 'invalid_profile');
  }

  return Object.freeze({
    apiUrl: normalizeApiBaseUrl(profile.apiUrl),
    apiKey,
    model,
  });
}

function normalizeRevision(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

async function getStoredProviderValues() {
  await restrictLocalStorageToTrustedContexts();
  return requireLocalStorage().get([
    PERSONAL_PROVIDER_PROFILE_KEY,
    ANALYSIS_PROVIDER_MODE_KEY,
    PERSONAL_PROVIDER_REVISION_KEY,
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
        'Allow access to this provider before using personal analysis.',
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
        : new PersonalProviderError('Personal provider setup is unavailable.', 'invalid_profile'),
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
  return {
    mode,
    profile: readiness.profile,
    revision: normalizeRevision(stored?.[PERSONAL_PROVIDER_REVISION_KEY]),
    isPersonalReady: readiness.ready,
    personalError: readiness.error,
  };
}

export async function setAnalysisProviderMode(mode) {
  if (!isValidProviderMode(mode)) {
    throw new PersonalProviderError('Invalid analysis provider mode.', 'invalid_mode');
  }

  const state = await getPersonalProviderState();
  if (mode === PERSONAL_PROVIDER_MODE && !state.isPersonalReady) {
    throw state.personalError || new PersonalProviderError(
      'Complete personal provider setup before selecting personal analysis.',
      'personal_provider_unavailable'
    );
  }

  await requireLocalStorage().set({ [ANALYSIS_PROVIDER_MODE_KEY]: mode });
  return mode;
}

/**
 * Request the exact provider origin before saving a replacement profile. The
 * previous origin is released only after the new profile has committed.
 */
export async function savePersonalProvider(profile) {
  const normalizedProfile = normalizePersonalProviderProfile(profile);
  const nextPermission = getOriginPermission(normalizedProfile.apiUrl);
  const stored = await getStoredProviderValues();
  const currentReadiness = await readProfileReadiness(stored?.[PERSONAL_PROVIDER_PROFILE_KEY]);
  const previousPermission = currentReadiness.permission;

  const permissions = requirePermissions();
  const granted = await permissions.request({ origins: [nextPermission] });
  if (!granted) {
    throw new PersonalProviderError(
      'Provider access was not granted. Personal settings were not saved.',
      'origin_permission_denied'
    );
  }

  const revision = normalizeRevision(stored?.[PERSONAL_PROVIDER_REVISION_KEY]) + 1;
  await requireLocalStorage().set({
    [PERSONAL_PROVIDER_PROFILE_KEY]: normalizedProfile,
    [PERSONAL_PROVIDER_REVISION_KEY]: revision,
  });

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
    PERSONAL_PROVIDER_REVISION_KEY,
  ]);

  if (readiness.permission) {
    await requirePermissions().remove({ origins: [readiness.permission] });
  }

  return MANAGED_PROVIDER_MODE;
}
