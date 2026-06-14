# Japanese Alchemy Firebase Functions

Firebase Cloud Functions for the Japanese Alchemy project.

## Overview

This project provides Firebase Cloud Functions for Japanese text analysis and data storage.

### Functions

- `explain` - Analyze Japanese text and extract vocabulary/grammar (public, callable)
- `explainStream` - Same as explain, but streams results via SSE (HTTP endpoint)
- `saveItems` - Save analysis results to Firestore (requires Firebase Authentication)

### LLM Providers

The backend supports multiple LLM providers behind a common `LlmService` interface. Provider is selected via `LLM_PROVIDER` in `src/config.ts`:

- `"gemini"` (default) — Google Gemini via OpenAI-compatible endpoint
- `"zai"` — ZAI provider via OpenAI-compatible endpoint

Switching providers requires changing the constant and redeploying — no secret changes needed.

## Architecture

```
functions/
├── src/
│   ├── config.ts           # LLM_PROVIDER selection + Firebase Secret config
│   ├── index.ts            # Main entry point, exports functions
│   ├── models/             # TypeScript type definitions
│   ├── services/
│   │   ├── llmService.ts       # LlmService interface + createLlmService() factory
│   │   ├── geminiLlmService.ts # Gemini provider implementation
│   │   └── zaiLlmService.ts    # ZAI provider implementation
│   ├── utils/              # Utility functions
│   └── v1/                 # API handlers (callable + streaming)
└── lib/                    # Compiled JavaScript output
```

## Configuration

The functions use Google Cloud Secret Manager for storing API credentials. The secret `JAPANESE_ALCHEMY_CONFIG` contains:

```json
{
  "gemini": {
    "api_url": "https://generativelanguage.googleapis.com/v1beta/openai",
    "api_key": "YOUR_GEMINI_API_KEY",
    "model": "gemini-2.0-flash"
  },
  "zai": {
    "api_url": "YOUR_ZAI_API_URL",
    "api_key": "YOUR_ZAI_API_KEY",
    "model": "YOUR_ZAI_MODEL"
  }
}
```

The active provider is set via `LLM_PROVIDER` in `src/config.ts` (defaults to `"gemini"`).

### Managing Secrets

Secrets are stored in Google Cloud Secret Manager. Use Firebase CLI to manage:

**View current secret value:**

```bash
firebase functions:secrets:access JAPANESE_ALCHEMY_CONFIG
```

**Update secret (creates a new version):**

```bash
echo '{"gemini":{"api_url":"https://...","api_key":"...","model":"..."},"zai":{"api_url":"...","api_key":"...","model":"..."}}' | \
  firebase functions:secrets:set JAPANESE_ALCHEMY_CONFIG --data-file=-

# or
firebase functions:secrets:set JAPANESE_ALCHEMY_CONFIG --data-file=./functions/secrets.json
```

After updating, redeploy for functions to pick up the new version:

```bash
cd japanese-alchemy-hosting && firebase deploy --only functions
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

To test locally, create a `secrets.json` file in the `functions/` directory:

```bash
echo '{
  "gemini": {
    "api_url": "https://generativelanguage.googleapis.com/v1beta/openai",
    "api_key": "YOUR_GEMINI_API_KEY",
    "model": "gemini-2.0-flash"
  },
  "zai": {
    "api_url": "YOUR_ZAI_API_URL",
    "api_key": "YOUR_ZAI_API_KEY",
    "model": "YOUR_ZAI_MODEL"
  }
}' > secrets.json
```

This file is gitignored and is automatically loaded by the Firebase emulator.

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

## explainStream Abuse Hardening

`explainStream` is an unauthenticated HTTP endpoint that calls an LLM per request. It is layered against abuse / denial-of-wallet, in order of execution:

1. **Cost ceiling** (runtime options, `src/runtimeOptions.ts`) — `maxInstances × concurrency` bounds concurrent streams; `timeoutSeconds` bounds per-request stream duration. With `concurrency: 1`, `maxInstances` is a literal concurrent-stream cap.
2. **Body-size guard** — requests over 16 KB (Content-Length) are rejected with `413` before any work.
3. **Input validation** (`src/v1/requestValidation.ts`) — `content` 2–500 chars, `context_*` ≤ `MAX_CONTEXT_CHARS`, types, prompt version; invalid → `400`.
4. **Per-IP rate limit** (`src/v1/rateLimiter.ts`) — Firestore token bucket keyed by an HMAC of the client IP; over-limit → `429`. Fails open on a missing IP, **fails closed on a Firestore error**.

### Alerting signal

The rate limiter's fail-closed path logs at **error** level: `"Rate limit: Firestore error — denying (fail-closed)"`. A sustained rate of that log line means the fairness layer is down (requests are being rejected to protect spend) — page on it.

### Tuning

`maxInstances`, `concurrency`, and `RATE_LIMIT_CAPACITY` / `RATE_LIMIT_REFILL_PER_MIN` are constants chosen for a low-traffic extension. Derive them from a worst-case daily-spend budget; raise `maxInstances` if legitimate concurrency demands it (the product `maxInstances × concurrency` is the worst-case concurrent-spend window). Per-IP limiting caps a single source; distributed/rotating-IP abuse is bounded only by `maxInstances` — Cloud Armor is the escalation path.

### Post-deploy verification runbook

After `firebase deploy --only functions`, probe each layer against the live `explainStream` URL (`$URL = https://us-central1-<projectId>.cloudfunctions.net/explainStream`):

```bash
# 1. Oversized body -> 413 (never reaches the LLM)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$URL" \
  -H "Content-Type: application/json" \
  --data-binary "$(python3 -c 'print("{\"content\":\"" + "あ"*100000 + "\"}")')"
# expect: 413

# 2. Oversized content -> 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d '{"content":"'"$(python3 -c 'print("あ"*501)')"'"}'
# expect: 400

# 3. Rate limit -> 429 after the per-IP threshold (burst)
for i in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$URL" \
    -H "Content-Type: application/json" -d '{"content":"テストです"}'
done
# expect: 200s then 429s once the bucket empties

# 4. Valid request still streams (200 + SSE)
curl -s -X POST "$URL" -H "Content-Type: application/json" -d '{"content":"テストです"}' | head
# expect: event: chunk / data: ... (a streamed analysis)
```

Then in the Google Cloud console (or `firebase functions:log`) confirm: `explainStream` shows the configured `maxInstances`/`concurrency`/`timeoutSeconds`; the `rateLimits` Firestore collection appears and rejects direct client writes (the deny rule in `firestore.rules`).

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
# Check if secret exists and view its value
firebase functions:secrets:access JAPANESE_ALCHEMY_CONFIG

# If not, create it (see "Managing Secrets" section above)
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
