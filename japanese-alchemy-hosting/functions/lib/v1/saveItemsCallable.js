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
exports.saveItemsHandler = void 0;
const functions = __importStar(require("firebase-functions"));
const firestoreService_1 = require("../services/firestoreService");
const logger_1 = require("../utils/logger");
async function saveItemsHandler(request) {
    logger_1.logger.setContext(request);
    const data = request.data;
    const { analysis, userId } = data;
    if (!analysis) {
        logger_1.logger.error("Invalid request: analysis is required");
        throw new functions.https.HttpsError("invalid-argument", "Analysis is required");
    }
    const words = analysis.words || [];
    const grammars = analysis.grammars || [];
    const isShared = analysis.is_shared || false;
    const metadata = analysis.metadata || {};
    logger_1.logger.info(`saveItems received`, {
        userId: userId || 'shared',
        is_shared: isShared,
        words_count: words.length,
        grammars_count: grammars.length,
        has_metadata: Object.keys(metadata).length > 0,
    });
    try {
        const firestoreService = new firestoreService_1.FirestoreService();
        // Ensure userId is null if not provided (not undefined)
        const safeUserId = userId ?? null;
        // Save vocabulary items
        const wordsSaved = await firestoreService.saveVocabulary(safeUserId, words, isShared, metadata);
        // Save grammar items
        const grammarsSaved = await firestoreService.saveGrammar(safeUserId, grammars, isShared, metadata);
        const response = {
            success: true,
            message: isShared
                ? "Items saved to shared collection"
                : "Items saved successfully",
            saved: {
                words_count: wordsSaved,
                grammars_count: grammarsSaved,
            },
        };
        logger_1.logger.info(`Successfully saved items`, {
            userId: userId || 'shared',
            is_shared: isShared,
            words_saved: wordsSaved,
            grammars_saved: grammarsSaved,
        });
        return response;
    }
    catch (error) {
        logger_1.logger.error("Error in saveItems callable", error);
        throw new functions.https.HttpsError("internal", error instanceof Error ? error.message : "Failed to save items");
    }
}
exports.saveItemsHandler = saveItemsHandler;
//# sourceMappingURL=saveItemsCallable.js.map