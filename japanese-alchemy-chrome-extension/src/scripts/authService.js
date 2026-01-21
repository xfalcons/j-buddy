// Authentication Service for Japanese Alchemy Chrome Extension
// Manages Firebase Authentication with Google Sign-In
import { getAuth, signInWithCredential, GoogleAuthProvider, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import firebaseConfig from './firebaseConfig.js';

class AuthService {
  constructor() {
    this.user = null;
    this.isAuthenticated = false;
    this.offscreenDocumentId = null;
    this.isOffscreenDocumentReady = false;
    this.firebaseApp = null;
    this.auth = null;
    this.init();
  }

  async init() {
    // Initialize Firebase App and Auth
    this.firebaseApp = initializeApp(firebaseConfig);
    this.auth = getAuth(this.firebaseApp);
    
    // Load user from storage
    await this.loadUserFromStorage();
    
    // If user is stored, initialize auth state
    if (this.user) {
      try {
        // Try to sign in silently to get a token
        // Note: This won't work without a credential, but we'll handle this
        // by using the stored user info directly for callable functions
        console.log('[AuthService] User loaded, auth state ready');
      } catch (error) {
        console.warn('[AuthService] Could not restore auth state:', error);
      }
    }
  }

  // Load user from chrome.storage.local
  async loadUserFromStorage() {
    const { user } = await chrome.storage.local.get('user');
    if (user) {
      this.user = user;
      this.isAuthenticated = true;
      console.log('[AuthService] User loaded from storage:', this.user.email);
    }
    return this.user;
  }

  // Check if user is authenticated
  isLoggedIn() {
    return this.isAuthenticated && this.user !== null;
  }

  // Get current user
  getUser() {
    return this.user;
  }

  // Get Firebase Auth instance (for callable functions)
  getAuthInstance() {
    return this.auth;
  }

  // Get Firebase App instance
  getAppInstance() {
    return this.firebaseApp;
  }

  // Get auth from offscreen document
  async getAuthFromOffscreen() {
    return new Promise(async (resolve, reject) => {
      const auth = await chrome.runtime.sendMessage({
        type: 'firebase-auth',
        target: 'offscreen'
      });
      auth?.name !== 'FirebaseError' ? resolve(auth) : reject(auth);
    })
  }

  // Create an offscreen document for authentication
  async createOffscreenDocument() {
    console.log('[AuthService] Creating offscreen document...');

    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('offscreen/offscreen.html')]
    });

    if (existingContexts.length > 0) {
      console.log('[AuthService] Offscreen document already exists');
      return;
    }

    // Create the offscreen document
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['IFRAME_SCRIPTING'],
      justification: 'Firebase Authentication requires an iframe in an offscreen document for sign-in with popup'
    });

    console.log('[AuthService] Offscreen document created');
  }

  // Ensure offscreen document is ready
  async ensureOffscreenDocumentReady() {
    if (this.isOffscreenDocumentReady) {
      return true;
    }

    // Create the offscreen document
    await this.createOffscreenDocument();

    const auth = await this.getAuthFromOffscreen();
    return auth !== null;
  }

  // Sign in with Google
  async signInWithGoogle() {
    console.log('[AuthService] Initiating Google sign-in...');

    try {
      // Ensure offscreen document is ready
      const isReady = await this.ensureOffscreenDocumentReady();
      if (!isReady) {
        throw new Error('Offscreen document failed to initialize');
      }

      // Send sign-in request to offscreen document
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Sign-in request timed out'));
        }, 60000); // 60 second timeout

        const listener = async (message) => {
          if (message.success === true && message.user) {
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(listener);

            // Save user
            this.user = message.user;
            this.isAuthenticated = true;
            chrome.storage.local.set({ user: this.user });

            // Sign in with credential in this context for callable functions
            if (message.credential && message.credential.accessToken) {
              try {
                const provider = new GoogleAuthProvider();
                const credential = provider.credential({
                  idToken: message.credential.accessToken
                });
                await signInWithCredential(this.auth, credential);
                console.log('[AuthService] Firebase Auth state established in sidepanel context');
              } catch (authError) {
                console.warn('[AuthService] Could not establish auth state in sidepanel:', authError);
                // This is not critical - we'll still use the user data
              }
            }

            console.log('[AuthService] User signed in:', this.user.email);
            resolve(this.user);
          } else if (message.success === false) {
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(listener);
            const error = message.error || 'Unknown error';
            console.error('[AuthService] Sign-in failed:', error);
            reject(new Error(error));
          }
        };

        chrome.runtime.onMessage.addListener(listener);

        // Send sign-in request
        chrome.runtime.sendMessage({
          type: 'signInWithGoogle'
        });
      });
    } catch (error) {
      console.error('[AuthService] Sign-in error:', error);
      throw error;
    }
  }

  // Sign out
  async signOut() {
    console.log('[AuthService] Signing out...');

    try {
      // Ensure offscreen document is ready
      const isReady = await this.ensureOffscreenDocumentReady();
      if (!isReady) {
        throw new Error('Offscreen document failed to initialize');
      }

      // Send sign-out request to offscreen document
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Sign-out request timed out'));
        }, 10000); // 10 second timeout

        const listener = (message) => {
          if (message.action === 'signOut' && message.success === true) {
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(listener);

            // Clear user
            this.user = null;
            this.isAuthenticated = false;
            chrome.storage.local.remove('user');

            console.log('[AuthService] User signed out');
            resolve(true);
          } else if (message.action === 'signOut' && message.success === false) {
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(listener);
            const error = message.error || 'Unknown error';
            console.error('[AuthService] Sign-out failed:', error);
            reject(new Error(error));
          }
        };

        chrome.runtime.onMessage.addListener(listener);

        // Send sign-out request
        chrome.runtime.sendMessage({
          type: 'signOut'
        });
      });
    } catch (error) {
      console.error('[AuthService] Sign-out error:', error);
      throw error;
    }
  }

  // Get authentication token (for API calls)
  async getToken() {
    if (!this.isLoggedIn()) {
      throw new Error('User is not authenticated');
    }
    
    try {
      // Try to get token from Firebase Auth
      const currentUser = this.auth.currentUser;
      if (currentUser) {
        const token = await currentUser.getIdToken();
        return token;
      }
    } catch (error) {
      console.warn('[AuthService] Could not get Firebase token:', error);
    }
    
    // Fallback: return UID (this won't work for callable functions that require auth)
    return this.user.uid;
  }
}

// Create a singleton instance
const authService = new AuthService();

// Export the singleton instance
export default authService;

// Also attach to window for global access
window.authService = authService;
