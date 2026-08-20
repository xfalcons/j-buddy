import * as admin from "firebase-admin";
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { FirestoreService } from "../../src/services/firestoreService";

// Mock firebase-admin. `firestore` is a stable jest.fn whose return value is
// configured in beforeEach so the service's constructor (this.db = admin.firestore())
// and the test see the same db instance. The current source writes via
// db.batch().set().commit(), not collection.add().
jest.mock("firebase-admin", () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(),
}));

describe("FirestoreService", () => {
  let service: FirestoreService;
  let mockDb: any;
  let mockBatch: any;
  let mockCollection: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // commit() returns undefined by default; `await undefined` resolves fine,
    // so no mockResolvedValue is needed (and jest.fn() here infers `never`).
    mockBatch = {
      set: jest.fn(),
      commit: jest.fn(),
    };
    mockCollection = { doc: jest.fn() };
    mockDb = {
      batch: jest.fn(() => mockBatch),
      collection: jest.fn(() => mockCollection),
    };

    (admin as any).firestore.mockReturnValue(mockDb);

    service = new FirestoreService();
  });

  describe("saveVocabulary", () => {
    it("should save vocabulary items to Firestore", async () => {
      const words = [
        { term: "日本語", detail: "Japanese language" },
        { term: "勉強", detail: "Study" },
      ];
      const userId = "test-user";

      const saved = await service.saveVocabulary(userId, words);

      expect(saved).toBe(2);
      expect(mockBatch.set).toHaveBeenCalledTimes(2);
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
    });

    it("should handle empty words array without writing", async () => {
      const userId = "test-user";

      const saved = await service.saveVocabulary(userId, []);

      expect(saved).toBe(0);
      expect(mockBatch.commit).not.toHaveBeenCalled();
    });

    it("should use the per-user vocabularies collection path", async () => {
      const words = [{ term: "test", detail: "test detail" }];
      const userId = "test-user";

      await service.saveVocabulary(userId, words);

      expect(mockDb.collection).toHaveBeenCalledWith(
        `users/${userId}/vocabularies`
      );
    });

    it("should include a createdAt timestamp on each item", async () => {
      const words = [{ term: "test", detail: "test detail" }];
      const userId = "test-user";

      await service.saveVocabulary(userId, words);

      const addedData = mockBatch.set.mock.calls[0][1];
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

      const saved = await service.saveGrammar(userId, grammars);

      expect(saved).toBe(2);
      expect(mockBatch.set).toHaveBeenCalledTimes(2);
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
    });

    it("should handle empty grammars array without writing", async () => {
      const userId = "test-user";

      const saved = await service.saveGrammar(userId, []);

      expect(saved).toBe(0);
      expect(mockBatch.commit).not.toHaveBeenCalled();
    });

    it("should use the per-user grammars collection path", async () => {
      const grammars = [{ point: "test", explanation: "test explanation" }];
      const userId = "test-user";

      await service.saveGrammar(userId, grammars);

      expect(mockDb.collection).toHaveBeenCalledWith(
        `users/${userId}/grammars`
      );
    });

    it("should include a createdAt timestamp on each item", async () => {
      const grammars = [{ point: "test", explanation: "test explanation" }];
      const userId = "test-user";

      await service.saveGrammar(userId, grammars);

      const addedData = mockBatch.set.mock.calls[0][1];
      expect(addedData).toHaveProperty("createdAt");
      expect(typeof addedData.createdAt).toBe("number");
    });
  });

  describe("saveAnalysisPage", () => {
    it("stores structured JSON when saving a page", async () => {
      const add = jest.fn();
      mockDb.collection.mockReturnValue({ add });
      const structuredJson = {
        words: [{ term: "日本語", detail: "Japanese language" }],
        grammars: [{ point: "〜です", explanation: "Copula" }],
      };

      await service.saveAnalysisPage("test-user", {
        rendered_markdown: "# Analysis",
        structured_json: structuredJson,
      });

      expect(add).toHaveBeenCalledWith(expect.objectContaining({
        structured_json: structuredJson,
      }));
    });

    it("keeps structured JSON optional for legacy page saves", async () => {
      const add = jest.fn();
      mockDb.collection.mockReturnValue({ add });

      await service.saveAnalysisPage("test-user", {
        rendered_markdown: "# Analysis",
      });

      expect(add).toHaveBeenCalledWith(expect.not.objectContaining({
        structured_json: expect.anything(),
      }));
    });

    it("stores structured JSON on shared pages", async () => {
      const add = jest.fn();
      mockDb.collection.mockReturnValue({ add });
      const structuredJson = { words: [], grammars: [] };

      await service.saveAnalysisPage(null, {
        rendered_markdown: "# Shared analysis",
        structured_json: structuredJson,
      }, true);

      expect(mockDb.collection).toHaveBeenCalledWith("shared_analysis_pages");
      expect(add).toHaveBeenCalledWith(expect.objectContaining({
        structured_json: structuredJson,
      }));
    });
  });
});
