import { defineJsonSecret } from "firebase-functions/params";

// Define the JSON secret
export const configSecret = defineJsonSecret("JAPANESE_ALCHEMY_CONFIG");

// LLM provider selection — change this to switch providers.
// Valid values: "gemini" | "zai" | "bedrock-response" | "bedrock-chat"
export const LLM_PROVIDER: string = "gemini";
// Static provider chain for sequential fallback (first available wins).
export const LLM_CHAIN = ["bedrock-response", "bedrock-chat", "gemini", "zai"] as const;

export interface ProviderConfig {
  api_url: string;
  api_key: string;
  model: string;
}

export interface AppConfig {
  gemini: ProviderConfig;
  zai: ProviderConfig;
  bedrock: {
    responses: ProviderConfig;
    chat: ProviderConfig;
  };
}

export function getConfig(): AppConfig {
  return configSecret.value() as AppConfig;
}
