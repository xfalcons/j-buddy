import * as admin from "firebase-admin";
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { FirestoreService } from "../../src/services/firestoreService";

// Mock firebase-admin
jest.mock("firebase-admin", () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      add: jest.fn(),
      doc: jest.fn(),
    })),
  })),
}));

describe("FirestoreService", () => {
  let service: FirestoreService;
  let mockDb: any;
  let mockCollection: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = admin.firestore();
    mockCollection = mockDb.collection.mock.results[0]?.value;
    service = new FirestoreService();
  });

  describe("saveVocabulary", () => {
    it("should save vocabulary items to Firestore", async () => {
      const words = [
        { term: "日本語", detail: "Japanese language" },
        { term: "勉強", detail: "Study" },
      ];
      const userId = "test-user";

      // Mock successful saves
      mockCollection.add = jest.fn()
        .mockResolvedValueOnce({ id: "doc1" })
        .mockResolvedValueOnce({ id: "doc2" });

      const saved = await service.saveVocabulary(userId, words);

      expect(saved).toBe(2);
    });

    it("should handle empty words array", async () => {
      const userId = "test-user";

      const saved = await service.saveVocabulary(userId, []);

      expect(saved).toBe(0);
    });

    it("should include userId in collection path", async () => {
      const words = [{ term: "test", detail: "test detail" }];
      const userId = "test-user";

      mockCollection.add = jest.fn().mockResolvedValue({ id: "doc1" });

      await service.saveVocabulary(userId, words);

      expect(mockDb.collection).toHaveBeenCalledWith(
        `users/${userId}/vocabularies`
      );
    });

    it("should include createdAt timestamp", async () => {
      const words = [{ term: "test", detail: "test detail" }];
      const userId = "test-user";

      mockCollection.add = jest.fn().mockResolvedValue({ id: "doc1" });

      await service.saveVocabulary(userId, words);

      const addedData = mockCollection.add.mock.calls[0][0];
      expect(addedData).toHaveProperty("createdAt");
      expect(typeof addedData.createdAt).toBe("number");
    });
  });

  describe("saveGrammar", () => {
    it("should save grammar items to Firestore", async () => {
      const grammars = [
        { point: "〜てください", explanation: "Request form" },
        { point: "〜たいと思います", explanation: "Intention form" },
      ];
      const userId = "test-user";

      // Mock successful saves
      mockCollection.add = jest.fn()
        .mockResolvedValueOnce({ id: "doc1" })
        .mockResolvedValueOnce({ id: "doc2" });

      const saved = await service.saveGrammar(userId, grammars);

      expect(saved).toBe(2);
    });

    it("should handle empty grammars array", async () => {
      const userId = "test-user";

      const saved = await service.saveGrammar(userId, []);

      expect(saved).toBe(0);
    });

    it("should include userId in collection path", async () => {
      const grammars = [{ point: "test", explanation: "test explanation" }];
      const userId = "test-user";

      mockCollection.add = jest.fn().mockResolvedValue({ id: "doc1" });

      await service.saveGrammar(userId, grammars);

      expect(mockDb.collection).toHaveBeenCalledWith(
        `users/${userId}/grammars`
      );
    });

    it("should include createdAt timestamp", async () => {
      const grammars = [{ point: "test", explanation: "test explanation" }];
      const userId = "test-user";

      mockCollection.add = jest.fn().mockResolvedValue({ id: "doc1" });

      await service.saveGrammar(userId, grammars);

      const addedData = mockCollection.add.mock.calls[0][0];
      expect(addedData).toHaveProperty("createdAt");
      expect(typeof addedData.createdAt).toBe("number");
    });
  });
});
