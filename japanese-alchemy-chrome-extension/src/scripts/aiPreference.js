const AI_PREFERENCE_KEY = 'aiPreference';
export const DEFAULT_AI = 'gemini';
export const VALID_AI_PREFERENCES = ['gemini', 'zai'];

export async function getAiPreference() {
  const result = await chrome.storage.local.get(AI_PREFERENCE_KEY);
  const value = result?.[AI_PREFERENCE_KEY];
  if (VALID_AI_PREFERENCES.includes(value)) return value;
  await chrome.storage.local.set({ [AI_PREFERENCE_KEY]: DEFAULT_AI });
  return DEFAULT_AI;
}

export async function setAiPreference(value) {
  if (!VALID_AI_PREFERENCES.includes(value)) throw new Error('Unsupported AI preference');
  await chrome.storage.local.set({ [AI_PREFERENCE_KEY]: value });
}
