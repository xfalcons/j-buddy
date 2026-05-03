"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = exports.LLM_PROVIDER = exports.configSecret = void 0;
const params_1 = require("firebase-functions/params");
// Define the JSON secret
exports.configSecret = (0, params_1.defineJsonSecret)("JAPANESE_ALCHEMY_CONFIG");
// LLM provider selection — change this to switch providers.
// Valid values: "gemini" | "zai"
exports.LLM_PROVIDER = "gemini";
function getConfig() {
    return exports.configSecret.value();
}
exports.getConfig = getConfig;
//# sourceMappingURL=config.js.map