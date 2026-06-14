// Import Firebase Functions
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
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

    // Derive the streaming endpoint URL from the Firebase project config
    const projectId = firebaseConfig.projectId;
    this.streamUrl = `https://us-central1-${projectId}.cloudfunctions.net/explainStream`;
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
      throw new Error(`Firebase explain function failed: ${errorMessage}`);
    }
  }

  /**
   * Generate response using SSE streaming
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

      const response = await fetch(this.streamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequestBody(selectedText, promptVersion, context))
      });

      if (!response.ok) {
        let detail = await response.text();
        try {
          const parsed = JSON.parse(detail);
          if (parsed && parsed.error) detail = parsed.error;
        } catch {
          // body wasn't JSON; keep the raw text
        }
        throw new Error(`Stream request failed: ${response.status} ${detail}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE frames from the server
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = null;

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim();
          } else if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();

            if (currentEvent === 'chunk') {
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.content) {
                  console.log('[Firebase API] Received chunk:', parsed.content);
                  fullText += parsed.content;
                  onChunk(parsed.content, fullText);
                }
              } catch {
                // Skip malformed JSON
              }
            } else if (currentEvent === 'error') {
              try {
                const parsed = JSON.parse(dataStr);
                onError(parsed.error || 'Unknown streaming error');
                return;
              } catch {
                onError(dataStr);
                return;
              }
            } else if (currentEvent === 'done' || dataStr === '[DONE]') {
              // Stream complete
            }
            currentEvent = null;
          }
        }
      }

      onDone(fullText);
    } catch (error) {
      console.error('[Firebase API] Stream error:', error);
      // If we got partial results, still deliver them
      if (fullText) {
        console.warn('[Firebase API] Stream interrupted, delivering partial results');
        onDone(fullText);
      } else {
        onError(error.message || 'Stream request failed');
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
        throw new Error(result.data?.message || 'Save operation failed');
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
        throw new Error('You must be signed in to save items to your private collection. Please sign in first.');
      }
      
      // Extract error details
      const errorMessage = error.message || error.code || 'Unknown error occurred';
      throw new Error(`Firebase saveItems function failed: ${errorMessage}`);
    }
  }
}

// Export the service
window.JaAlchemyApiService = JaAlchemyApiService;
