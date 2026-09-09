import { defineJsonSecret } from "firebase-functions/params";

const configSecret = defineJsonSecret("JAPANESE_ALCHEMY_CONFIG");
export const runtimeSecrets = [configSecret];

// LLM provider selection — change this to switch providers.
// Valid values: "gemini" | "zai" | "bedrock_response" | "bedrock_chat"
export const LLM_PROVIDER: string = "gemini";
// Static provider chain for sequential fallback (first available wins).
export const LLM_CHAIN = ["bedrock_response", "bedrock_chat", "gemini", "zai"] as const;

export interface ProviderConfig {
  api_url: string;
  api_key: string;
  model: string;
}

export interface AppConfig {
  gemini: ProviderConfig;
  zai: ProviderConfig;
  bedrock_response: ProviderConfig;
  bedrock_chat: ProviderConfig;
}

export function getConfig(): AppConfig {
  return configSecret.value() as AppConfig;
}
