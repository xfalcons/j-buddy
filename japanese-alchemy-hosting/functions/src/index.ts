import * as admin from "firebase-admin";
import { onCall } from "firebase-functions/v2/https";

// Initialize Firebase Admin (only once)
admin.initializeApp();

// Import handler functions and secret
import { explainHandler } from "./v1/explainCallable";
import { explainStreamCallableHandler } from "./v1/explainStreamCallableHandler";
import { saveItemsHandler } from "./v1/saveItemsCallable";
import { runtimeSecrets } from "./config";
import { explainRuntimeOptions } from "./runtimeOptions";

// Create and export callable functions with v2 API
// runtimeSecrets binds the JSON configuration secret to each callable.
// LLM-backed callables share cost-ceiling runtime options (see
// runtimeOptions.ts); saveItems is auth-gated and not LLM-backed, so it is
// left on defaults.
export const explain = onCall(
  { ...explainRuntimeOptions, secrets: runtimeSecrets },
  explainHandler
);

export const explainStreamCallable = onCall(
  { ...explainRuntimeOptions, timeoutSeconds: 120, secrets: runtimeSecrets },
  explainStreamCallableHandler
);

export const saveItems = onCall(
  { secrets: runtimeSecrets },
  saveItemsHandler
);
