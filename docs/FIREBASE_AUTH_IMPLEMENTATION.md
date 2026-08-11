# Firebase Authentication Implementation

## Overview
This document describes the Firebase Authentication implementation for the Japanese Alchemy Chrome Extension using "Sign in with Google".

## Architecture

The implementation follows Firebase's recommended approach for Chrome Extensions using the offscreen document pattern:

```
┌─────────────────┐
│   Sidepanel     │ ◄─── User Interface
│  (sidepanel.js) │      Auth UI & State
└────────┬────────┘
         │
         │ chrome.runtime.sendMessage
         │
         ▼
┌─────────────────┐
│  Background     │ ◄─── Message Router
│ (background.js) │      Offscreen Doc Management
└────────┬────────┘
         │
         │ chrome.offscreen.createDocument
         │
         ▼
┌─────────────────────────────────┐
│   Offscreen Document           │ ◄─── Iframe Container
│  (offscreen.html + .js)       │      Message Bridging
└────────┬────────────────────────┘
         │ postMessage
         │
         ▼
┌─────────────────────────────────┐
│   Firebase Hosting Iframe       │ ◄─── Firebase Auth
│  (sign-in-with-popup.html)     │      Google Sign-In
└─────────────────────────────────┘
```

## Implementation Details

### 1. Manifest Permissions

Added `offscreen` permission to manifest.json:
```json
{
  "permissions": [
    "sidePanel",
    "storage",
    "offscreen"
  ]
}
```

### 2. Offscreen Document

**File:** `src/offscreen/offscreen.html`
- Contains an iframe loading the Firebase hosting page
- Loads offscreen.js for message handling

**File:** `src/offscreen/offscreen.js`
- Forwards messages between extension and Firebase hosting iframe
- Handles authentication responses
- Sends `offscreenReady` notification when loaded

### 3. Authentication Service

**File:** `src/scripts/authService.js`

Key features:
- Singleton service pattern
- Manages user state in `chrome.storage.local`
- Creates and manages offscreen document lifecycle
- Provides `signInWithGoogle()` and `signOut()` methods
- Handles timeouts and error states

#### Main Methods:

```javascript
// Check authentication status
authService.isLoggedIn()

// Get current user
authService.getUser()

// Sign in with Google
await authService.signInWithGoogle()

// Sign out
await authService.signOut()

// Get authentication token
await authService.getToken()
```

### 4. Firebase Hosting Page

**File:** `japanese-alchemy-hosting/public/sign-in-with-popup.html`

- Hosted at `https://japanese-alchemy.web.app/sign-in-with-popup.html`
- Contains Firebase Auth SDK imports
- Handles Google Sign-In popup
- Communicates via postMessage with parent iframe

### 5. Sidepanel Integration

**File:** `src/sidepanel/sidepanel.html`

Added auth section with:
- Sign-out state: Google Sign-In button
- Sign-in state: User info (photo, name, email) + Sign Out button

**File:** `src/sidepanel/sidepanel.js`

Integration points:
- Import authService
- Add auth DOM elements
- `updateAuthUI()` - Updates UI based on auth state
- `handleSignIn()` - Handles sign-in button click
- `handleSignOut()` - Handles sign-out button click
- Event listeners for sign-in/out buttons

## User Flow

### Sign In Flow

1. User clicks "Sign in with Google" button in sidepanel
2. `authService.signInWithGoogle()` is called
3. Service creates offscreen document if not exists
4. Service sends `signInWithGoogle` message to offscreen document
5. Offscreen document forwards to Firebase hosting iframe
6. Firebase Auth shows Google Sign-In popup in iframe
7. User completes Google authentication
8. Firebase sends success response with user data
9. User data is saved to `chrome.storage.local`
10. UI updates to show signed-in state

### Sign Out Flow

1. User clicks "Sign Out" button in sidepanel
2. `authService.signOut()` is called
3. Service sends `signOut` message to offscreen document
4. Firebase signs out the user
5. Success response is received
6. User data is cleared from `chrome.storage.local`
7. UI updates to show signed-out state

### Session Persistence

- User authentication state persists in `chrome.storage.local`
- On extension reload, authService automatically loads saved user
- If user is logged in, sidepanel shows signed-in state immediately

## Webpack Configuration

Added entries and copy rules:

```javascript
entry: {
  // ... existing entries
  authService: './src/scripts/authService.js',
  offscreen: './src/offscreen/offscreen.js',
}

new CopyWebpackPlugin({
  patterns: [
    // ... existing patterns
    {
      from: './src/offscreen/offscreen.html',
      to: 'offscreen/offscreen.html',
    },
  ],
})
```

## Firebase Console Configuration

Required Firebase Console settings:

1. **Authentication** → **Sign-in method**:
   - Enable "Google" sign-in provider
   - Add authorized domains:
     - `japanese-alchemy.web.app` (Firebase hosting)
     - `chrome-extension://*` (for development)

2. **Authorization domains**:
   - Add `japanese-alchemy.web.app`
   - Add `chrome-extension://*`

3. **OAuth consent screen**:
   - Configure app name and logo
   - Add required scopes: `email`, `profile`

## Testing

### Local Testing

1. Build the extension:
   ```bash
   cd japanese-alchemy-chrome-extension
   npm run build
   ```

2. Load unpacked extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `japanese-alchemy-chrome-extension/dist`

3. Test sign-in:
   - Open the sidepanel
   - Click "Sign in with Google"
   - Complete Google authentication in popup
   - Verify user info appears in sidepanel

4. Test persistence:
   - Reload the extension
   - Verify user remains signed in

5. Test sign-out:
   - Click "Sign Out"
   - Verify signed-out state appears
   - Reload extension
   - Verify user remains signed out

### Known Issues & Troubleshooting

**Issue:** "Sign-in failed: Offscreen document failed to initialize"

**Solution:**
- Check that `offscreen` permission is in manifest.json
- Verify offscreen.html and offscreen.js are built correctly
- Check browser console for errors

**Issue:** "Sign-in failed: Sign-in request timed out"

**Solution:**
- Ensure Firebase hosting page is deployed and accessible
- Check iframe URL in offscreen.html is correct
- Verify Firebase project configuration

**Issue:** User not persisting after reload

**Solution:**
- Check that user is saved to chrome.storage.local
- Verify authService.init() is called on load
- Check for storage permission errors

**Issue:** Firebase Auth error in console

**Solution:**
- Verify Firebase config values are correct
- Check that authorized domains are configured in Firebase Console
- Ensure Google sign-in provider is enabled

## Security Considerations

1. **OAuth Domain Configuration**
   - Only authorized domains can use Firebase Auth
   - Production domains should be explicitly listed
   - Wildcard domains should be used cautiously

2. **Token Storage**
   - User tokens are stored in chrome.storage.local
   - Tokens are sensitive and should be handled carefully
   - Consider implementing token refresh logic

3. **Message Validation**
   - Offscreen document should validate message sources
   - Consider adding origin checks for postMessage

## Future Enhancements

1. **Token Management**
   - Implement automatic token refresh
   - Handle token expiration gracefully

2. **Additional Auth Providers**
   - Add support for other providers (email/password, etc.)
   - Allow users to link multiple auth methods

3. **Role-Based Access**
   - Implement user roles for different permission levels
   - Restrict certain features based on user role

4. **Analytics**
   - Track authentication events
   - Monitor sign-in/sign-out rates

## References

- [Firebase Auth for Web Extensions](https://firebase.google.com/docs/auth/web/chrome-extension)
- [Chrome Offscreen Documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Chrome Extension Message Passing](https://developer.chrome.com/docs/extensions/mv3/messaging/)
