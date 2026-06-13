/**
 * A/B prompt-variant assignment for the Chrome extension.
 *
 * The variant is read from chrome.storage.local on each analysis and sent to the
 * explainStream endpoint as the `prompt` field. On first launch it is unset, so we
 * assign the default ("v2") and persist it — this keeps the initial rollout
 * uniform. To start the A/B test, set some users' `promptVariant` to "v1"
 * (debug toggle or random assignment); see docs/plans/...prompt-evaluation-harness.
 */

const PROMPT_VARIANT_KEY = "promptVariant";
const DEFAULT_VARIANT = "v2";
const VALID_VARIANTS = ["v1", "v2"];

/**
 * Resolve the prompt variant to use. Returns the stored value when valid,
 * otherwise persists and returns the default.
 * @returns {Promise<"v1" | "v2">}
 */
export async function getPromptVariant() {
  const result = await chrome.storage.local.get(PROMPT_VARIANT_KEY);
  const variant = result?.[PROMPT_VARIANT_KEY];

  if (VALID_VARIANTS.includes(variant)) {
    return variant;
  }

  await chrome.storage.local.set({ [PROMPT_VARIANT_KEY]: DEFAULT_VARIANT });
  return DEFAULT_VARIANT;
}
