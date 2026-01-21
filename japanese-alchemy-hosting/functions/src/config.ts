import { defineJsonSecret } from "firebase-functions/params";

// Define the JSON secret
export const configSecret = defineJsonSecret("JAPANESE_ALCHEMY_CONFIG");

export interface AppConfig {
  google: {
    api_url: string;
  };
  gemini: {
    api_key: string;
    model: string;
  };
}

export function getConfig(): AppConfig {
  return configSecret.value() as AppConfig;
}
