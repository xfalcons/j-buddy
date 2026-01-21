# Japanese Alchemy Firebase Functions

Firebase Cloud Functions for the Japanese Alchemy project.

## Overview

This project provides Firebase Cloud Functions for Japanese text analysis and data storage.

### Functions

- `explain` - Analyze Japanese text and extract vocabulary/grammar (public, no auth required)
- `saveItems` - Save analysis results to Firestore (requires Firebase Authentication)

## Architecture

```
functions/
├── src/
│   ├── config.ts           # Firebase Secret Manager configuration
│   ├── index.ts            # Main entry point, exports functions
│   ├── models/             # TypeScript type definitions
│   ├── services/           # Business logic services
│   ├── utils/              # Utility functions
│   └── v1/                # API v1 callable functions
└── lib/                   # Compiled JavaScript output
```

## Configuration

The functions use Firebase Secret Manager for configuration. The secret `JAPANESE_ALCHEMY_CONFIG` contains:

```json
{
  "google": {
    "api_url": "YOUR_GEMINI_API_URL"
  },
  "gemini": {
    "api_key": "YOUR_GEMINI_API_KEY",
    "model": "gemini-2.0-flash-exp"
  }
}
```

### Setting Up Secrets

**First time setup:**

```bash
cd japanese-alchemy-hosting

# Export existing config to Secret Manager
firebase functions:config:export

# Follow the prompts to name your secret (e.g., JAPANESE_ALCHEMY_CONFIG)
```

**Updating secrets:**

```bash
# Update the config values
firebase functions:config:set google.api_url="YOUR_GEMINI_API_URL"
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"
firebase functions:config:set gemini.model="gemini-2.0-flash-exp"

# Export to update the secret
firebase functions:config:export
```

**Viewing secrets:**

```bash
firebase secrets:access JAPANESE_ALCHEMY_CONFIG
```

## Installation

```bash
cd functions
npm install
```

## Development

### Build

```bash
npm run build
```

### Serve with Emulators

```bash
npm run serve
```

This will start:
- Functions emulator on port 5001
- Firestore emulator
- Auth emulator

### Testing with Emulators

To test locally, create a local secret file or set environment variables:

```bash
# For functions emulator, you can use environment variables
export GOOGLE_API_URL="YOUR_GEMINI_API_URL"
export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
export GEMINI_MODEL="gemini-2.0-flash-exp"

# Or create a .runtimeconfig.json file
echo '{"google":{"api_url":"YOUR_GEMINI_API_URL"},"gemini":{"api_key":"YOUR_GEMINI_API_KEY","model":"gemini-2.0-flash-exp"}}' > .runtimeconfig.json
```

## Deployment

```bash
cd japanese-alchemy-hosting

# Deploy all functions
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:explain

# View logs
firebase functions:log
```

**Note:** Functions are automatically deployed with secrets bound. The `JAPANESE_ALCHEMY_CONFIG` secret must exist in Secret Manager.

## API Reference

### explain

Public function for Japanese text analysis.

**Request:**
```typescript
{
  content: string;      // Japanese text to analyze
  prompt: "v1" | "v2"; // Prompt version (optional, default: "v1")
}
```

**Response:**
```typescript
{
  success: true;
  data: string;         // Analysis result (JSON string)
  timestamp: number;     // Unix timestamp
}
```

**Example:**
```javascript
import { httpsCallable } from 'firebase/functions';

const explainFn = httpsCallable(functions, 'explain');
const result = await explainFn({
  content: "日本語のテキスト",
  prompt: "v2"
});

console.log(result.data);
```

### saveItems

Authenticated function to save analysis results to Firestore.

**Request:**
```typescript
{
  analysis: {
    words: Array<{
      term: string;     // Japanese word/phrase
      detail: string;   // Explanation/definition
    }>;
    grammars: Array<{
      point: string;        // Grammar point
      explanation: string;   // Detailed explanation
    }>;
  };
}
```

**Response:**
```typescript
{
  success: true;
  message: string;
  saved: {
    words_count: number;
    grammars_count: number;
  };
}
```

**Example:**
```javascript
import { httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

const auth = getAuth();

if (!auth.currentUser) {
  throw new Error("Must be signed in");
}

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

## Firestore Structure

```
users/
  {userId}/
    vocabularies/
      {documentId}/
        term: string
        detail: string
        createdAt: timestamp
    grammars/
      {documentId}/
        point: string
        explanation: string
        createdAt: timestamp
```

## Security

- `explain`: Public function (no authentication required)
- `saveItems`: Requires Firebase Authentication
- Firestore rules ensure users can only access their own data
- API keys stored securely in Firebase Secret Manager

## Dependencies

- `firebase-admin` v13.6.0 - Firebase Admin SDK
- `firebase-functions` v7.0.2 - Cloud Functions SDK (latest)

## Version History

- **v1.0** - Initial release with explain and saveItems functions
- **v1.1** - Migrated from functions.config() to Firebase Secret Manager
- **v1.2** - Updated to Firebase Functions v6
- **v1.3** - Updated to Firebase Functions v7.0.2 (latest)

## Troubleshooting

### "secret does not exist" error

The `JAPANESE_ALCHEMY_CONFIG` secret must exist in Secret Manager:

```bash
# Check if secret exists
firebase secrets:list

# If not exists, create it
firebase functions:config:export
```

### "functions.config() is deprecated" warning

This project has been migrated to Secret Manager. You can safely ignore this warning or remove old config:

```bash
# Remove old config (after migration)
firebase functions:config:unset google.api_url
firebase functions:config:unset gemini.api_key
firebase functions:config:unset gemini.model
```

### Build errors

Ensure you have the correct Node.js version:

```bash
node --version  # Should be 22.x
```

If not, install the correct version with nvm:

```bash
nvm install 22
nvm use 22
```

## Support

For more information:
- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
- [Secret Manager Documentation](https://firebase.google.com/docs/functions/config-env)
