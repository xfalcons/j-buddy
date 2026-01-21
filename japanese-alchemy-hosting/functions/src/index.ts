import * as admin from "firebase-admin";
import { onCall } from "firebase-functions/v2/https";

// Initialize Firebase Admin (only once)
admin.initializeApp();

// Import handler functions and secret
import { explainHandler } from "./v1/explainCallable";
import { saveItemsHandler } from "./v1/saveItemsCallable";
import { configSecret } from "./config";

// Create and export callable functions with v2 API
// The configSecret object is passed to the secrets parameter
export const explain = onCall(
  { secrets: [configSecret] },
  explainHandler
);

export const saveItems = onCall(
  { secrets: [configSecret] },
  saveItemsHandler
);
