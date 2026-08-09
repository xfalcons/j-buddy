# Firebase Functions Integration Guide

## Current State

You have successfully updated the chrome extension to use Firebase callable functions:

1. **jaAlchemyApiService.js** - Now uses `httpsCallable()` to call Firebase functions
2. **explain** function - Works without authentication
3. **saveItems** function - REQUIRES authentication (checks `request.auth.uid`)

## The Authentication Challenge

The current architecture has a fundamental issue:

```
┌─────────────────────┐
│   Offscreen Doc    │ ← Firebase Auth State (signed in)
│   (iframe)         │
└─────────────────────┘
         ↑
         │ User data only
         │
         ↓
┌─────────────────────┐
│   Sidepanel        │ ← No Firebase Auth State
│   (context)       │    ❌ Callable functions fail here
└─────────────────────┘
```

When calling `saveItems`, Firebase checks for an authenticated user in the sidepanel context, but there isn't one because auth happened in the offscreen document's iframe.

## Solution Options

### Option 1: Pass UID Manually (Easiest, Less Secure)

Modify the Firebase function to accept UID directly:

**In `saveItemsCallable.ts`:**
```typescript
export async function saveItemsHandler(request: any): Promise<SaveItemsResponse> {
  // Get userId from data instead of request.auth
  const data = request.data as SaveItemsRequest;
  const userId = data.userId; // Passed from client
  
  if (!userId) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User ID is required"
    );
  }
  
  // Rest of the code remains the same...
}
```

**In `jaAlchemyApiService.js`:**
```javascript
async saveAnalysis(analysis) {
  // Get UID from auth service
  authService.getToken(); // or authService.getUser().uid
  
  const saveItemsCallable = httpsCallable(this.functions, 'saveItems');
  const result = await saveItemsCallable({
    analysis: analysis,
    userId: authService.getUser().uid
  });
  
  return result.data;
}
```

**Pros:**
- Simple to implement
- Works with current auth flow
- No major refactoring needed

**Cons:**
- Less secure (anyone could spoof another user's UID)
- Doesn't leverage Firebase's built-in auth protection

### Option 2: Establish Auth in Sidepanel Context (More Secure, More Complex)

When user signs in, use the credential to establish auth state in sidepanel:

**In `authService.js` (in `signInWithGoogle`):**
```javascript
if (message.credential && message.credential.accessToken) {
  try {
    const provider = new GoogleAuthProvider();
    const credential = provider.credential({
      idToken: message.credential.accessToken
    });
    await signInWithCredential(this.auth, credential);
    console.log('[AuthService] Firebase Auth state established in sidepanel context');
  } catch (authError) {
    console.warn('[AuthService] Could not establish auth state:', authError);
  }
}
```

**Pros:**
- More secure (auth state properly established)
- Callable functions work as designed
- Automatic token refresh

**Cons:**
- Requires access token sharing between contexts
- More complex implementation
- Token refresh handling needed

### Option 3: Hybrid Approach (Recommended)

For now, use Option 1 (manual UID) to get things working, then plan migration to Option 2 for better security.

## Recommended Next Steps

1. **Implement Option 1** to get `saveItems` working immediately
2. Test both `explain` and `saveItems` functions
3. Plan migration to Option 2 for production security

Would you like me to implement Option 1 now?
