const LEGACY_KEYS = [
  'personalProviderProfile',
  'analysisProviderMode',
  'personalProviderRevision',
  'personalProviderModelCatalogRef',
  'personalProviderModelSource',
  'personalProviderPendingPermissionCleanup',
];
const CATALOG_PREFIX = 'personalProviderModelCatalog:';

export async function retirePersonalProvider() {
  const stored = await chrome.storage.local.get(null);
  const keys = [...LEGACY_KEYS, ...Object.keys(stored).filter((key) => key.startsWith(CATALOG_PREFIX))];
  const origin = stored.personalProviderProfile?.apiUrl;
  await chrome.storage.local.remove(keys);
  if (origin && chrome.permissions?.remove) {
    try {
      await chrome.permissions.remove({ origins: [new URL(origin).origin + '/*'] });
    } catch (error) {
      console.warn('[Background] Unable to remove retired provider origin:', error.message);
    }
  }
}
