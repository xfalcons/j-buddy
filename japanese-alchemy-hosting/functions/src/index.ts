import * as admin from "firebase-admin";
import { onCall, onRequest } from "firebase-functions/v2/https";

// Initialize Firebase Admin (only once)
admin.initializeApp();

// Import handler functions and secret
import { explainHandler } from "./v1/explainCallable";
import { explainStreamHandler } from "./v1/explainStreamHandler";
import { saveItemsHandler } from "./v1/saveItemsCallable";
import { configSecret } from "./config";

// Create and export callable functions with v2 API
// The configSecret object is passed to the secrets parameter
export const explain = onCall(
  { secrets: [configSecret] },
  explainHandler
);

export const explainStream = onRequest(
  { secrets: [configSecret], cors: true, timeoutSeconds: 120 },
  explainStreamHandler
);

export const saveItems = onCall(
  { secrets: [configSecret] },
  saveItemsHandler
);
