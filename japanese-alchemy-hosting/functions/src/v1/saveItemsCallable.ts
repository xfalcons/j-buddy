import * as functions from "firebase-functions";
import { SaveItemsRequest, SaveItemsResponse } from "../models/types";
import { FirestoreService } from "../services/firestoreService";
import { logger } from "../utils/logger";

export async function saveItemsHandler(request: any): Promise<SaveItemsResponse> {
  logger.setContext(request);

  const data = request.data as SaveItemsRequest;
  const { analysis, userId } = data;

  if (!analysis) {
    logger.error("Invalid request: analysis is required");
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Analysis is required"
    );
  }

   const words = analysis.words || [];
   const grammars = analysis.grammars || [];
    const page = analysis.page;
   const isShared = analysis.is_shared || false;
   const metadata = analysis.metadata || {};

  logger.info(`saveItems received`, {
    userId: userId || 'shared',
    is_shared: isShared,
    words_count: words.length,
    grammars_count: grammars.length,
    has_metadata: Object.keys(metadata).length > 0,
  });

  try {
    const firestoreService = new FirestoreService();

    // Ensure userId is null if not provided (not undefined)
    const safeUserId = userId ?? null;

    // Save vocabulary items
    const wordsSaved = await firestoreService.saveVocabulary(
      safeUserId, 
      words, 
      isShared, 
      metadata
    );

    // Save grammar items
    const grammarsSaved = await firestoreService.saveGrammar(
      safeUserId,
      grammars,
      isShared,
      metadata
    );

    const pageSaved = page
      ? await firestoreService.saveAnalysisPage(safeUserId, page, isShared, metadata)
      : false;

    const response: SaveItemsResponse = {
      success: true,
      message: isShared
        ? "Items saved to shared collection"
        : "Items saved successfully",
      saved: {
        words_count: wordsSaved,
        grammars_count: grammarsSaved,
        page_saved: pageSaved,
      },
    };

    logger.info(`Successfully saved items`, {
      userId: userId || 'shared',
      is_shared: isShared,
      words_saved: wordsSaved,
      grammars_saved: grammarsSaved,
    });

    return response;
  } catch (error) {
    logger.error("Error in saveItems callable", error);
    throw new functions.https.HttpsError(
      "internal",
      error instanceof Error ? error.message : "Failed to save items"
    );
  }
}
