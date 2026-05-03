import { defineJsonSecret } from "firebase-functions/params";

// Define the JSON secret
export const configSecret = defineJsonSecret("JAPANESE_ALCHEMY_CONFIG");

// LLM provider selection — change this to switch providers.
// Valid values: "gemini" | "zai"
export const LLM_PROVIDER: string = "gemini";

export interface ProviderConfig {
  api_url: string;
  api_key: string;
  model: string;
}

export interface AppConfig {
  gemini: ProviderConfig;
  zai: ProviderConfig;
}

export function getConfig(): AppConfig {
  return configSecret.value() as AppConfig;
}
