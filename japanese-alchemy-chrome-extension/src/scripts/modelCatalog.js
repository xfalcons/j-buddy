export const MAX_MODEL_CATALOG_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_MODEL_CATALOG_IDS = 2000;
export const MAX_MODEL_ID_CODE_POINTS = 512;
export const MAX_MODEL_CATALOG_ID_BYTES = 512 * 1024;

const MISLEADING_MODEL_ID_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

export class ModelCatalogValidationError extends Error {
  constructor(message = '模型目錄無效。') {
    super(message);
    this.name = 'ModelCatalogValidationError';
    this.code = 'invalid_model_catalog';
  }
}

export function normalizeModelCatalogIds(modelIds, { requireCanonical = false } = {}) {
  if (!Array.isArray(modelIds) || modelIds.length === 0) {
    throw new ModelCatalogValidationError();
  }

  const normalized = [];
  const seen = new Set();
  let aggregateBytes = 0;
  for (const modelId of modelIds) {
    const rawValue = typeof modelId === 'string' ? modelId : '';
    if (MISLEADING_MODEL_ID_CHARACTERS.test(rawValue)
        || [...rawValue].length > MAX_MODEL_ID_CODE_POINTS) {
      throw new ModelCatalogValidationError();
    }
    const value = rawValue.trim();
    if (requireCanonical && value !== rawValue) throw new ModelCatalogValidationError();
    if (!value) {
      if (requireCanonical) throw new ModelCatalogValidationError();
      continue;
    }
    if (seen.has(value)) {
      if (requireCanonical) throw new ModelCatalogValidationError();
      continue;
    }
    seen.add(value);
    normalized.push(value);
    aggregateBytes += new TextEncoder().encode(value).byteLength;
    if (normalized.length > MAX_MODEL_CATALOG_IDS
        || aggregateBytes > MAX_MODEL_CATALOG_ID_BYTES) {
      throw new ModelCatalogValidationError();
    }
  }

  if (!normalized.length) throw new ModelCatalogValidationError();
  return Object.freeze(normalized);
}
