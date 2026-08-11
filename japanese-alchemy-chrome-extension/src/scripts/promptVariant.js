/**
 * A/B prompt-variant assignment for the Chrome extension.
 *
 * The variant is read from chrome.storage.local on each analysis and sent to the
 * managed analysis callable as the `prompt` field. On first launch it is unset, so we
 * assign the default ("v2") and persist it — this keeps the initial rollout
 * uniform. To start the A/B test, set some users' `promptVariant` to "v1"
 * (debug toggle or random assignment); see docs/plans/...prompt-evaluation-harness.
 */

export const PROMPT_VARIANT_KEY = "promptVariant";
export const DEFAULT_VARIANT = "v2";
export const VALID_VARIANTS = ["v1", "v2"];

export const ANALYSIS_MODE_OPTIONS = Object.freeze([
  Object.freeze({
    variant: "v1",
    label: "精簡分析",
    title: "快速理解目前選取的日文",
  }),
  Object.freeze({
    variant: "v2",
    label: "造句分析",
    title: "重點放在搭配、例句和可重複使用的句型",
  }),
]);

const ANALYSIS_MODE_BY_VARIANT = ANALYSIS_MODE_OPTIONS.reduce((acc, mode) => {
  acc[mode.variant] = mode;
  return acc;
}, {});

export function isValidPromptVariant(variant) {
  return VALID_VARIANTS.includes(variant);
}

export function getAnalysisModeForVariant(variant) {
  return ANALYSIS_MODE_BY_VARIANT[variant] || ANALYSIS_MODE_BY_VARIANT[DEFAULT_VARIANT];
}

/**
 * Resolve the prompt variant to use. Returns the stored value when valid,
 * otherwise persists and returns the default.
 * @returns {Promise<"v1" | "v2">}
 */
export async function getPromptVariant() {
  const result = await chrome.storage.local.get(PROMPT_VARIANT_KEY);
  const variant = result?.[PROMPT_VARIANT_KEY];

  if (isValidPromptVariant(variant)) {
    return variant;
  }

  await chrome.storage.local.set({ [PROMPT_VARIANT_KEY]: DEFAULT_VARIANT });
  return DEFAULT_VARIANT;
}

/**
 * Persist a prompt variant selected through the analysis-mode UI.
 * @param {"v1" | "v2"} variant
 * @returns {Promise<"v1" | "v2">}
 */
export async function setPromptVariant(variant) {
  if (!isValidPromptVariant(variant)) {
    throw new RangeError(`Invalid prompt variant: ${variant}`);
  }

  await chrome.storage.local.set({ [PROMPT_VARIANT_KEY]: variant });
  return variant;
}
