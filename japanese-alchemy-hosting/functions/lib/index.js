"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveItems = exports.explain = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
// Initialize Firebase Admin (only once)
admin.initializeApp();
// Import handler functions and secret
const explainCallable_1 = require("./v1/explainCallable");
const saveItemsCallable_1 = require("./v1/saveItemsCallable");
const config_1 = require("./config");
// Create and export callable functions with v2 API
// The configSecret object is passed to the secrets parameter
exports.explain = (0, https_1.onCall)({ secrets: [config_1.configSecret] }, explainCallable_1.explainHandler);
exports.saveItems = (0, https_1.onCall)({ secrets: [config_1.configSecret] }, saveItemsCallable_1.saveItemsHandler);
//# sourceMappingURL=index.js.map