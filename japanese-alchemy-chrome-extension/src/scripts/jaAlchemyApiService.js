// Import Firebase Functions
import { initializeApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import firebaseConfig from './firebaseConfig.js';
import { buildRequestBody } from './requestBody.js';

class JaAlchemyApiService {
  constructor() {
    // Initialize Firebase app (singleton pattern)
    if (!window.firebaseApp) {
      window.firebaseApp = initializeApp(firebaseConfig);
    }

    // Initialize Firebase Functions
    this.app = window.firebaseApp;
    this.functions = getFunctions(this.app, 'us-central1'); // Use your region
    if (process.env.NODE_ENV === 'development') {
      connectFunctionsEmulator(this.functions, '127.0.0.1', 5001);
    }
  }

  /**
   * Generate response using Firebase callable function
   * @param {string} selectedText - The text to analyze
   * @param {string} promptVersion - The prompt version ("v1" or "v2")
   * @param {{ before?: string, after?: string }} [context] - surrounding page context
   * @returns {Promise<Object>} Analysis result
   */
  async generateResponse(selectedText, promptVersion = "v2", context) {
    try {
      console.log('[Firebase API] Calling explain function with:', {
        content: selectedText.substring(0, 100) + '...',
        prompt: promptVersion
      });

      const explainCallable = httpsCallable(this.functions, 'explain');
      const result = await explainCallable(
        buildRequestBody(selectedText, promptVersion, context)
      );

      /*
      result.data structure:

      export interface SuccessResponse {
        success: boolean;
        data?: any;
        timestamp?: number;
      }
      */
      console.log('[Firebase API] Explain function response:', result.data.data);
      return result.data.data;
    } catch (error) {
      console.error('[Firebase API] Explain function error:', error);
      
      // Extract error details from Firebase error
      const errorMessage = error.message || error.code || 'Unknown error occurred';
      throw new Error(`Firebase explain 函式失敗：${errorMessage}`);
    }
  }

  /**
   * Generate response using Firebase callable streaming
   * @param {string} selectedText - The text to analyze
   * @param {string} promptVersion - The prompt version ("v1" or "v2")
   * @param {{ before?: string, after?: string }} [context] - surrounding page context
   * @param {function} onChunk - Callback invoked with each text chunk
   * @param {function} onDone - Callback invoked with the full accumulated text when stream completes
   * @param {function} onError - Callback invoked with an error message on failure
   */
  async generateResponseStream(selectedText, promptVersion, context, onChunk, onDone, onError) {
    let fullText = '';
    try {
      console.log('[Firebase API] Calling explainStream with:', {
        content: selectedText.substring(0, 100) + '...',
        prompt: promptVersion
      });

      const explainStreamCallable = httpsCallable(this.functions, 'explainStreamCallable');
      const { stream, data } = await explainStreamCallable.stream(
        buildRequestBody(selectedText, promptVersion, context)
      );

      for await (const chunk of stream) {
        if (!chunk?.content) continue;
        console.log('[Firebase API] Received chunk:', chunk.content);
        fullText += chunk.content;
        onChunk(chunk.content, fullText);
      }

      const result = await data;
      if (!result?.success) {
        onError(result?.error || '未知的串流錯誤');
        return;
      }

      onDone(fullText);
    } catch (error) {
      console.error('[Firebase API] Stream error:', error);
      // If we got partial results, still deliver them
      if (fullText) {
        console.warn('[Firebase API] Stream interrupted, delivering partial results');
        onDone(fullText);
      } else {
        onError(error.message || '串流請求失敗');
      }
    }
  }

  /**
   * Save analysis to Firestore using Firebase callable function
   * @param {Object} analysis - Analysis object with words and grammars
   * @param {string|null} userId - Optional user ID (null for shared collections)
   * @returns {Promise<Object>} Response with saved counts
   */
  async saveAnalysis(analysis, userId = null) {
    try {
      console.log('[Firebase API] Calling saveItems function with:', {
        user_id: userId || 'shared',
        is_shared: analysis.is_shared,
        words_count: analysis.words?.length || 0,
        grammars_count: analysis.grammars?.length || 0
      });

      const saveItemsCallable = httpsCallable(this.functions, 'saveItems');
      const result = await saveItemsCallable({
        userId: userId,
        analysis: analysis
      });

      console.log('[Firebase API] SaveItems function response:', result.data);

      if (!result.data || !result.data.success) {
        throw new Error(result.data?.message || '儲存操作失敗');
      }

      return {
        success: true,
        words_count: result.data.saved?.words_count || 0,
        grammars_count: result.data.saved?.grammars_count || 0,
        message: result.data.message || 'Analysis saved successfully'
      };
    } catch (error) {
      console.error('[Firebase API] SaveItems function error:', error);
      
      // Handle specific Firebase errors
      // Handle specific authentication errors (only for private collections)
      if (!analysis.is_shared && (error.code === 'unauthenticated' || error.message?.includes('unauthenticated'))) {
        throw new Error('您必須先登入，才能將項目儲存至私人收藏。');
      }
      
      // Extract error details
      const errorMessage = error.message || error.code || 'Unknown error occurred';
      throw new Error(`Firebase saveItems 函式失敗：${errorMessage}`);
    }
  }
}

// Export the service
window.JaAlchemyApiService = JaAlchemyApiService;
