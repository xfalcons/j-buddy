# Functions Migration Guide

This document describes the migration of the Japanese Alchemy API from Hono/Cloudflare Workers to Firebase Cloud Functions.

## Overview

The API has been migrated from a Hono-based implementation on Cloudflare Workers to Firebase Cloud Functions (Gen 2).

## Key Changes

### 1. Function Type Change

**Before (Hono):**
- HTTP endpoints (`GET`, `POST`)
- RESTful API design

**After (Firebase):**
- Callable functions (`httpsCallable`)
- Direct function calls with automatic auth handling

### 2. Authentication

**Before:**
- No authentication for `/api/v1/explain`
- User ID included in request for `/api/v1/save-items`

**After:**
- No authentication for `explain` function
- Firebase Auth required for `saveItems` function
- User ID automatically extracted from Firebase Auth context

### 3. Configuration

**Before:**
- Environment variables in `.dev.vars`

**After:**
- Firebase Secret Manager (`JAPANESE_ALCHEMY_CONFIG`)
- Migrated from `functions.config()` to Secret Manager

## Migration Steps

### Step 1: Set Up Firebase Project

```bash
cd japanese-alchemy-hosting

# Initialize Firebase (if not already done)
firebase init

# Configure environment variables using Secret Manager
firebase functions:config:set google.api_url="YOUR_GEMINI_API_URL"
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"
firebase functions:config:set gemini.model="gemini-2.0-flash-exp"

# Export config to Secret Manager
firebase functions:config:export
```

When prompted, name your secret: `JAPANESE_ALCHEMY_CONFIG`

### Step 2: Install Dependencies

```bash
cd functions
npm install
```

### Step 3: Build and Test Locally

```bash
npm run build
npm run serve
```

### Step 4: Deploy

```bash
cd japanese-alchemy-hosting
firebase deploy --only functions
```

## API Changes

### Explain Function

**Old Endpoint:** `POST /api/v1/explain`

**New Function:** `explain` (callable)

**Request:**
```typescript
// Before
{
  "content": "Japanese text",
  "prompt": "v2"
}

// After (same structure)
{
  content: "Japanese text",
  prompt: "v2"
}
```

**Response:**
```typescript
// Before
{
  "success": true,
  "data": "...",
  "timestamp": 1234567890
}

// After (same structure)
{
  success: true,
  data: "...",
  timestamp: 1234567890
}
```

### Save Items Function

**Old Endpoint:** `POST /api/v1/save-items`

**New Function:** `saveItems` (callable)

**Request:**
```typescript
// Before
{
  "userId": "user123",
  "analysis": {
    "words": [...],
    "grammars": [...]
  }
}

// After (userId automatically from Firebase Auth)
{
  analysis: {
    words: [...],
    grammars: [...]
  }
}
```

**Response:**
```typescript
// Before
{
  "success": true,
  "message": "Items saved",
  "saved": {
    "words_count": 5,
    "grammars_count": 3
  }
}

// After (same structure)
{
  success: true,
  message: "Items saved",
  saved: {
    words_count: 5,
    grammars_count: 3
  }
}
```

## Configuration Migration

### From Cloudflare Workers

**Before:**
```bash
# .dev.vars
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta
GEMINI_API_KEY=your-api-key
GEMINI_MODEL=gemini-2.0-flash-exp
```

**After:**
```bash
# Secret Manager (via Firebase CLI)
firebase functions:config:set google.api_url="https://generativelanguage.googleapis.com/v1beta"
firebase functions:config:set gemini.api_key="your-api-key"
firebase functions:config:set gemini.model="gemini-2.0-flash-exp"
firebase functions:config:export
```

### From functions.config()

**Before:**
```typescript
// Old way (deprecated)
import * as functions from "firebase-functions";

class GeminiService {
  constructor() {
    this.apiUrl = functions.config().google.api_url;
    this.apiKey = functions.config().gemini.api_key;
    this.model = functions.config().gemini.model;
  }
}
```

**After:**
```typescript
// New way (Secret Manager)
import { getConfig } from "./config";

class GeminiService {
  constructor() {
    const config = getConfig();
    this.apiUrl = config.google.api_url;
    this.apiKey = config.gemini.api_key;
    this.model = config.gemini.model;
  }
}
```

## Database Migration

### Firestore Structure

**Before (Cloudflare D1):**
```
vocabularies
  - id
  - user_id
  - term
  - detail
  - created_at

grammars
  - id
  - user_id
  - point
  - explanation
  - created_at
```

**After (Firestore):**
```
users/{userId}
  /vocabularies
    /{documentId}
      term: string
      detail: string
      createdAt: timestamp

  /grammars
    /{documentId}
      point: string
      explanation: string
      createdAt: timestamp
```

### Security Rules

Firestore rules ensure users can only access their own data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{collection}/{documentId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Testing Migration

### 1. Test Explain Function

```javascript
// Chrome Extension - background.js
import { httpsCallable } from 'firebase/functions';

const explainFn = httpsCallable(functions, 'explain');
const result = await explainFn({
  content: "日本語の勉強",
  prompt: "v2"
});

console.log(result.data);
```

### 2. Test Save Items Function

```javascript
// Chrome Extension - background.js
import { httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

const auth = getAuth();
const saveItemsFn = httpsCallable(functions, 'saveItems');

const result = await saveItemsFn({
  analysis: {
    words: [
      { term: "日本語", detail: "Japanese language" }
    ],
    grammars: [
      { point: "〜てください", explanation: "Request form" }
    ]
  }
});

console.log("Saved:", result.data.saved);
```

## Benefits of Firebase Migration

1. **Authentication:** Native Firebase Auth integration
2. **Security:** Built-in user isolation in Firestore
3. **Scalability:** Automatic scaling with Firebase infrastructure
4. **Configuration:** Secure secret management
5. **Monitoring:** Built-in logging and monitoring
6. **Client SDK:** First-class Firebase SDK support
7. **Development:** Local emulator support

## Troubleshooting

### Secret Manager Issues

**Error:** "secret does not exist"

**Solution:**
```bash
# Check if secret exists
firebase secrets:list

# Create secret from existing config
firebase functions:config:export
```

**Error:** "functions.config() is deprecated"

**Solution:** This is expected after migration. The code now uses Secret Manager.

### Deployment Issues

**Error:** "failed to create function"

**Solution:**
```bash
# Ensure secret exists
firebase secrets:access JAPANESE_ALCHEMY_CONFIG

# Rebuild functions
cd functions && npm run build

# Redeploy
firebase deploy --only functions
```

### Function Not Found

**Error:** "function not found"

**Solution:**
```bash
# Verify functions are deployed
firebase functions:list

# Check deployment logs
firebase functions:log
```

## Rollback Plan

If needed, you can rollback to Cloudflare Workers:

1. Deploy previous version to Cloudflare Workers
2. Update Chrome Extension to use Workers API
3. Remove Firebase deployment:
   ```bash
   firebase deploy --only functions:explain --force
   firebase deploy --only functions:saveItems --force
   ```

## Additional Resources

- [Chrome Extension Update Guide](CHROME_EXTENSION_UPDATE.md)
- [Functions README](functions/README.md)
- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
- [Firebase Secret Manager](https://firebase.google.com/docs/functions/config-env)

## Support

For migration issues:
1. Check Firebase Console logs
2. Review deployment output
3. Test with Firebase Emulators first
4. Consult Firebase Functions documentation
