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
exports.FirestoreService = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
class FirestoreService {
    db;
    constructor() {
        this.db = admin.firestore();
    }
    async saveVocabulary(userId, words, isShared = false, metadata = {}) {
        if (!words || words.length === 0) {
            return 0;
        }
        const batch = this.db.batch();
        // Determine collection path based on shared flag
        const vocabulariesRef = isShared
            ? this.db.collection('shared_vocabularies')
            : this.db.collection(`users/${userId}/vocabularies`);
        const timestamp = Date.now();
        words.forEach((word) => {
            const docRef = vocabulariesRef.doc();
            const vocabularyItem = {
                term: word.term,
                detail: JSON.stringify(word),
                createdAt: timestamp,
            };
            // Add metadata if saving to shared collection
            if (isShared && Object.keys(metadata).length > 0) {
                vocabularyItem.metadata = metadata;
            }
            batch.set(docRef, vocabularyItem);
        });
        await batch.commit();
        const logMessage = isShared
            ? `Saved ${words.length} vocabulary items to shared collection`
            : `Saved ${words.length} vocabulary items for user ${userId}`;
        functions.logger.info(logMessage);
        return words.length;
    }
    async saveGrammar(userId, grammars, isShared = false, metadata = {}) {
        if (!grammars || grammars.length === 0) {
            return 0;
        }
        const batch = this.db.batch();
        // Determine collection path based on shared flag
        const grammarsRef = isShared
            ? this.db.collection('shared_grammars')
            : this.db.collection(`users/${userId}/grammars`);
        const timestamp = Date.now();
        grammars.forEach((grammar) => {
            const docRef = grammarsRef.doc();
            const grammarItem = {
                point: grammar.point,
                explanation: JSON.stringify(grammar),
                createdAt: timestamp,
            };
            // Add metadata if saving to shared collection
            if (isShared && Object.keys(metadata).length > 0) {
                grammarItem.metadata = metadata;
            }
            batch.set(docRef, grammarItem);
        });
        await batch.commit();
        const logMessage = isShared
            ? `Saved ${grammars.length} grammar items to shared collection`
            : `Saved ${grammars.length} grammar items for user ${userId}`;
        functions.logger.info(logMessage);
        return grammars.length;
    }
    async getUserVocabularies(userId, limit) {
        const query = this.db
            .collection(`users/${userId}/vocabularies`)
            .orderBy("createdAt", "desc")
            .limit(limit || 50);
        const snapshot = await query.get();
        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
    }
    async getUserGrammars(userId, limit) {
        const query = this.db
            .collection(`users/${userId}/grammars`)
            .orderBy("createdAt", "desc")
            .limit(limit || 50);
        const snapshot = await query.get();
        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
    }
}
exports.FirestoreService = FirestoreService;
//# sourceMappingURL=firestoreService.js.map