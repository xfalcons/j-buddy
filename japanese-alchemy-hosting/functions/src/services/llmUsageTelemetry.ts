import * as functions from "firebase-functions";
import { AiProvider, LlmUsage } from "../models/types";

export type LlmProvider = AiProvider;
export type LlmOperation = "batch" | "stream";
export type UsageStatus = "recorded" | "usage_missing" | "usage_malformed" | "stream_incomplete";
export type PriceStatus = "priced" | "price_unavailable";

export interface LlmPriceCatalogEntry {
  provider: LlmProvider;
  model: string;
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
  sourceUrl: string;
  verifiedOn: string;
  effectiveDateNote: string;
  inputNanoUsdPerToken: number;
  cachedInputNanoUsdPerToken: number;
  outputNanoUsdPerToken: number;
}

export interface LlmUsageTelemetryInput {
  provider: LlmProvider;
  requestedModel: string;
  responseModel?: string;
  operation: LlmOperation;
  rawUsage?: LlmUsage | unknown;
  finishReason?: string | null;
  completed?: boolean;
}

export interface LlmUsageTelemetryRecord {
  provider: LlmProvider;
  requestedModel: string;
  responseModel?: string;
  operation: LlmOperation;
  promptTokens: number | null;
  cachedPromptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  finishReason?: string | null;
  completed?: boolean;
  usageStatus: UsageStatus;
  priceStatus: PriceStatus;
  catalogVersion: string;
  estimatedCostUsd: number | null;
}

export const LLM_PRICE_CATALOG_VERSION = "2026-08-31";

const GOOGLE_PRICING_URL = "https://ai.google.dev/gemini-api/docs/pricing";
const ZAI_PRICING_URL = "https://docs.z.ai/guides/overview/pricing";

export const LLM_PRICE_CATALOG: readonly LlmPriceCatalogEntry[] = [
  price("gemini", "gemini-3-flash-preview", 0.5, 0.05, 3, GOOGLE_PRICING_URL, "Preview; Google recommends migration to 3.5 Flash when appropriate."),
  price("gemini", "gemini-2.5-flash-lite", 0.1, 0.01, 0.4, GOOGLE_PRICING_URL, "Standard text/image/video pricing."),
  price("gemini", "gemini-2.5-flash", 0.3, 0.03, 2.5, GOOGLE_PRICING_URL, "Standard text/image/video pricing."),
  price("gemini", "gemini-3.1-flash-lite", 0.25, 0.025, 1.5, GOOGLE_PRICING_URL, "Standard text/image/video pricing."),
  price("gemini", "gemini-3.5-flash-lite", 0.3, 0.03, 2.5, GOOGLE_PRICING_URL, "Standard text/image/video pricing."),
  price("zai", "GLM-5.3-Flash", 0.075, 0.015, 0.25, ZAI_PRICING_URL, "Promotional rate ends 2026-09-09 UTC+8."),
  price("zai", "GLM-4.7-FlashX", 0.07, 0.01, 0.4, ZAI_PRICING_URL, "Current published text-model rate."),
  price("zai", "glm-4.7", 0.6, 0.11, 2.2, ZAI_PRICING_URL, "Current published text-model rate."),
];

function price(
  provider: LlmProvider,
  model: string,
  inputUsdPerMillion: number,
  cachedInputUsdPerMillion: number,
  outputUsdPerMillion: number,
  sourceUrl: string,
  effectiveDateNote: string
): LlmPriceCatalogEntry {
  return {
    provider,
    model,
    inputUsdPerMillion,
    cachedInputUsdPerMillion,
    outputUsdPerMillion,
    sourceUrl,
    verifiedOn: "2026-08-31",
    effectiveDateNote,
    inputNanoUsdPerToken: inputUsdPerMillion * 1_000,
    cachedInputNanoUsdPerToken: cachedInputUsdPerMillion * 1_000,
    outputNanoUsdPerToken: outputUsdPerMillion * 1_000,
  };
}

export function buildLlmUsageTelemetry(
  input: LlmUsageTelemetryInput
): LlmUsageTelemetryRecord {
  const normalized = input.operation === "stream" && input.completed === false ?
    emptyUsage("stream_incomplete") : normalizeUsage(input.rawUsage);
  const responseModel = input.responseModel;
  const model = responseModel || input.requestedModel;
  const catalogEntry = normalized.usageStatus === "recorded" ?
    LLM_PRICE_CATALOG.find((entry) => entry.provider === input.provider && entry.model === model) :
    undefined;

  const estimatedCostUsd = catalogEntry && normalized.usageStatus === "recorded" ?
    calculateCostUsd(catalogEntry, normalized.promptTokens, normalized.cachedPromptTokens, normalized.completionTokens) :
    null;

  return {
    provider: input.provider,
    requestedModel: input.requestedModel,
    ...(responseModel ? { responseModel } : {}),
    operation: input.operation,
    promptTokens: normalized.promptTokens,
    cachedPromptTokens: normalized.cachedPromptTokens,
    completionTokens: normalized.completionTokens,
    totalTokens: normalized.totalTokens,
    ...(input.finishReason !== undefined ? { finishReason: input.finishReason } : {}),
    ...(input.completed !== undefined ? { completed: input.completed } : {}),
    usageStatus: normalized.usageStatus,
    priceStatus: catalogEntry ? "priced" : "price_unavailable",
    catalogVersion: LLM_PRICE_CATALOG_VERSION,
    estimatedCostUsd,
  };
}

export function logLlmUsageTelemetry(input: LlmUsageTelemetryInput): void {
  try {
    functions.logger.info("LLM completion telemetry", buildLlmUsageTelemetry(input));
  } catch {
    // Observability is best-effort and must not affect a completion result.
  }
}

function normalizeUsage(rawUsage: LlmUsage | unknown): {
  usageStatus: UsageStatus;
  promptTokens: number | null;
  cachedPromptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
} {
  if (!rawUsage || typeof rawUsage !== "object") {
    return emptyUsage("usage_missing");
  }

  const usage = rawUsage as LlmUsage;
  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const totalTokens = usage.total_tokens;
  const cachedPromptTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;

  if (!isTokenCount(promptTokens) || !isTokenCount(completionTokens) ||
      (totalTokens !== undefined && !isTokenCount(totalTokens)) ||
      !isTokenCount(cachedPromptTokens) || cachedPromptTokens > promptTokens) {
    return emptyUsage("usage_malformed");
  }

  return {
    usageStatus: "recorded",
    promptTokens,
    cachedPromptTokens,
    completionTokens,
    totalTokens: totalTokens ?? null,
  };
}

function emptyUsage(usageStatus: UsageStatus) {
  return {
    usageStatus,
    promptTokens: null,
    cachedPromptTokens: null,
    completionTokens: null,
    totalTokens: null,
  };
}

function isTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function calculateCostUsd(
  entry: LlmPriceCatalogEntry,
  promptTokens: number | null,
  cachedPromptTokens: number | null,
  completionTokens: number | null
): number | null {
  if (promptTokens === null || cachedPromptTokens === null || completionTokens === null) {
    return null;
  }

  const totalNanoUsd =
    (promptTokens - cachedPromptTokens) * entry.inputNanoUsdPerToken +
    cachedPromptTokens * entry.cachedInputNanoUsdPerToken +
    completionTokens * entry.outputNanoUsdPerToken;

  return Number.isSafeInteger(totalNanoUsd) ? totalNanoUsd / 1_000_000_000 : null;
}
