import * as admin from "firebase-admin";
import { onCall, onRequest } from "firebase-functions/v2/https";

// Initialize Firebase Admin (only once)
admin.initializeApp();

// Import handler functions and secret
import { explainHandler } from "./v1/explainCallable";
import { explainStreamHandler } from "./v1/explainStreamHandler";
import { saveItemsHandler } from "./v1/saveItemsCallable";
import { configSecret } from "./config";
import { explainRuntimeOptions } from "./runtimeOptions";

// Create and export callable functions with v2 API
// The configSecret object is passed to the secrets parameter.
// explainStream and explain share cost-ceiling runtime options (see
// runtimeOptions.ts); saveItems is auth-gated and not LLM-backed, so it is
// left on defaults.
export const explain = onCall(
  { ...explainRuntimeOptions, secrets: [configSecret] },
  explainHandler
);

// explainStream overrides timeoutSeconds to 120: an SSE stream can run longer
// than the batch default (60s), and the platform killing it mid-flight would
// truncate the stream with no SSE error event. maxInstances bounds the
// concurrent-spend window regardless.
export const explainStream = onRequest(
  { ...explainRuntimeOptions, timeoutSeconds: 120, secrets: [configSecret], cors: true },
  explainStreamHandler
);

export const saveItems = onCall(
  { secrets: [configSecret] },
  saveItemsHandler
);
