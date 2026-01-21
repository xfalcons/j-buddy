# Chrome Extension Firebase Integration

This guide explains how to update the Chrome Extension to work with the new Firebase Functions backend.

## Prerequisites

The user must be signed in with Firebase Authentication before calling `saveItems`.

## Firebase SDK Setup

### 1. Import Firebase SDKs

In your Chrome Extension's content script or background script:

```javascript
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-functions.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';

// Initialize Firebase
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);
const auth = getAuth(app);
```

### 2. Update API Calls

#### Explain Function (No Authentication Required)

```javascript
async function callExplainFunction(content, promptVersion = 'v1') {
  const explainFunction = httpsCallable(functions, 'explain');
  
  const result = await explainFunction({
    content: content,
    prompt: promptVersion
  });
  
  return result.data;
}

// Usage:
const response = await callExplainFunction("Japanese text here", "v2");
console.log(response.data);
```

#### Save Items Function (Authentication Required)

```javascript
async function callSaveItemsFunction(analysis) {
  // Check if user is authenticated
  if (!auth.currentUser) {
    throw new Error("User must be signed in to save items");
  }
  
  const saveItemsFunction = httpsCallable(functions, 'saveItems');
  
  const result = await saveItemsFunction({
    analysis: analysis
  });
  
  return result.data;
}

// Usage:
try {
  const analysis = {
    words: [
      { term: "日本語", detail: "Japanese language" },
      { term: "勉強", detail: "Study" }
    ],
    grammars: [
      { point: "〜てください", explanation: "Request form: please do something" }
    ]
  };
  
  const response = await callSaveItemsFunction(analysis);
  console.log("Saved:", response.saved);
} catch (error) {
  console.error("Failed to save items:", error);
}
```

## Complete Example: Content Script Integration

```javascript
// contentScript.js

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-functions.js';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);
const auth = getAuth(app);

// Auth Provider
const googleProvider = new GoogleAuthProvider();

// Sign in function
async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.log("Signed in as:", result.user.displayName);
    return result.user;
  } catch (error) {
    console.error("Sign in error:", error);
    throw error;
  }
}

// Check if user is signed in
function isUserSignedIn() {
  return !!auth.currentUser;
}

// Get current user
function getCurrentUser() {
  return auth.currentUser;
}

// Sign out
async function signOut() {
  try {
    await auth.signOut();
    console.log("Signed out");
  } catch (error) {
    console.error("Sign out error:", error);
    throw error;
  }
}

// Explain function
async function explainJapaneseText(text, version = 'v2') {
  const explainFn = httpsCallable(functions, 'explain');
  const result = await explainFn({
    content: text,
    prompt: version
  });
  return result.data;
}

// Save items function
async function saveAnalysisItems(analysis) {
  if (!isUserSignedIn()) {
    throw new Error("Please sign in first");
  }
  
  const saveItemsFn = httpsCallable(functions, 'saveItems');
  const result = await saveItemsFn({
    analysis: analysis
  });
  return result.data;
}

// Auth state listener
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log("User is signed in:", user.displayName);
    // Update UI to show signed-in state
  } else {
    console.log("User is signed out");
    // Update UI to show signed-out state
  }
});

// Export functions for use in UI
window.jaAlchemyApi = {
  signIn: signInWithGoogle,
  signOut: signOut,
  isSignedIn: isUserSignedIn,
  getCurrentUser: getCurrentUser,
  explain: explainJapaneseText,
  saveItems: saveAnalysisItems
};
```

## UI Integration Example

```javascript
// sidepanel.js

// Show sign-in button if not signed in
if (!window.jaAlchemyApi.isSignedIn()) {
  document.getElementById('signInBtn').style.display = 'block';
}

// Sign in button click handler
document.getElementById('signInBtn').addEventListener('click', async () => {
  try {
    await window.jaAlchemyApi.signIn();
    document.getElementById('signInBtn').style.display = 'none';
    document.getElementById('userDisplay').textContent = 
      `Signed in as ${window.jaAlchemyApi.getCurrentUser().displayName}`;
  } catch (error) {
    alert('Failed to sign in: ' + error.message);
  }
});

// Save button click handler
document.getElementById('saveBtn').addEventListener('click', async () => {
  const analysis = parseAnalysisResult(document.getElementById('result').textContent);
  
  try {
    const response = await window.jaAlchemyApi.saveItems(analysis);
    alert(`Saved ${response.saved.words_count} words and ${response.saved.grammars_count} grammar points`);
  } catch (error) {
    if (error.message.includes('Please sign in')) {
      alert('Please sign in first to save items');
    } else {
      alert('Failed to save items: ' + error.message);
    }
  }
});
```

## Error Handling

Common errors and how to handle them:

### 1. Unauthenticated Error (saveItems)
```javascript
try {
  await saveAnalysisItems(analysis);
} catch (error) {
  if (error.code === 'unauthenticated') {
    // User is not signed in
    showSignInDialog();
  }
}
```

### 2. Invalid Argument Error
```javascript
try {
  await explainJapaneseText("", "v1");
} catch (error) {
  if (error.code === 'invalid-argument') {
    // Missing required field
    alert("Please provide some text to analyze");
  }
}
```

### 3. Internal Error
```javascript
try {
  await explainJapaneseText(text);
} catch (error) {
  if (error.code === 'internal') {
    // Server error
    alert("An error occurred. Please try again later.");
  }
}
```

## Testing

### Test with Firebase Emulators

1. Start emulators:
```bash
cd japanese-alchemy-hosting
firebase emulators:start
```

2. Update Firebase config in Chrome Extension:
```javascript
const firebaseConfig = {
  // ... other config
  // Connect to emulator
  authDomain: "localhost:9099",
  projectId: "YOUR_PROJECT"
};

// Connect functions to emulator
import { connectFunctionsEmulator } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-functions.js';
connectFunctionsEmulator(functions, "localhost", 5001);

// Connect auth to emulator
import { connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';
connectAuthEmulator(auth, "http://localhost:9099");
```

## Data Structure

### Analysis Format
```javascript
{
  words: [
    {
      term: "Japanese term",
      detail: "Detailed explanation"
    }
  ],
  grammars: [
    {
      point: "Grammar point",
      explanation: "Detailed explanation"
    }
  ]
}
```

### Firestore Storage
- Vocabulary stored at: `users/{userId}/vocabularies/{documentId}`
- Grammar stored at: `users/{userId}/grammars/{documentId}`

## Deployment

1. Deploy functions:
```bash
cd japanese-alchemy-hosting
firebase deploy --only functions
```

2. Update Firebase config in Chrome Extension with production values from Firebase Console

3. Remove emulator connections when using production:
```javascript
// Remove these lines for production:
// connectFunctionsEmulator(functions, "localhost", 5001);
// connectAuthEmulator(auth, "http://localhost:9099");
