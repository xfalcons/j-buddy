# Japanese Alchemy - Firebase Hosting

This repository contains the Firebase Hosting and Functions implementation for the Japanese Alchemy project.

## Project Structure

```
japanese-alchemy-hosting/
├── firebase.json              # Firebase configuration
├── firestore.rules            # Firestore security rules
├── .firebaserc             # Firebase project settings
├── public/                  # Hosting assets
│   ├── index.html           # Landing page
│   ├── sign-in-with-popup.html
│   └── signInWithPopup.js
├── functions/               # Firebase Cloud Functions
│   ├── src/
│   │   ├── config.ts       # Secret Manager configuration
│   │   ├── index.ts        # Function exports
│   │   ├── models/         # Type definitions
│   │   ├── services/       # Business logic
│   │   ├── utils/          # Utilities
│   │   └── v1/           # Callable functions
│   ├── test/               # Unit tests
│   ├── lib/                # Generated TypeScript output (gitignored)
│   ├── package.json
│   └── tsconfig.json
├── CHROME_EXTENSION_UPDATE.md    # Chrome extension integration guide
├── FUNCTIONS_MIGRATION.md        # Migration documentation
└── README.md                   # This file
```

## Features

### Firebase Functions

Two callable functions for Japanese text analysis:

- **explain** - Public API for Japanese text analysis (no auth required)
- **saveItems** - Save analysis results to Firestore (requires Firebase Auth)

### Firebase Hosting

Web hosting for sign-in and authentication.

## Getting Started

### Prerequisites

- Node.js 22.x
- Firebase CLI (`npm install -g firebase-tools`)
- Google Cloud project with Firebase enabled

### Installation

```bash
# Clone repository
cd japanese-alchemy-hosting

# Install function dependencies
cd functions
npm install
cd ..

# Initialize Firebase (if not already done)
firebase login
firebase init
```

### Configuration

The project uses Firebase Secret Manager (`JAPANESE_ALCHEMY_CONFIG`) to store LLM provider credentials. See [Functions README](functions/README.md) for secret setup, viewing, and updating instructions.

### Development

```bash
# Build functions
cd functions
npm run build
cd ..

# Start emulators
firebase emulators:start

# Deploy functions (automatically runs `npm run build` first)
firebase deploy --only functions

# Deploy hosting
firebase deploy --only hosting
```

## Documentation

### For Developers

- [Functions README](functions/README.md) - Detailed API documentation
- [Testing Guide](functions/TESTING.md) - Unit testing setup and examples
- [Migration Guide](FUNCTIONS_MIGRATION.md) - From Cloudflare Workers to Firebase

### For Chrome Extension

- [Chrome Extension Update](CHROME_EXTENSION_UPDATE.md) - Integration guide for Chrome Extension

## Firebase Functions

### explain Function

Public function for Japanese text analysis.

**Request:**
```typescript
{
  content: string;      // Japanese text to analyze
  prompt: "v1" | "v2"; // Prompt version (optional)
}
```

**Response:**
```typescript
{
  success: true;
  data: string;         // Analysis result
  timestamp: number;
}
```

### saveItems Function

Function to save analysis results to Firestore. Requires `userId` to be provided in the request.

**Request:**
```typescript
{
  userId: string;      // User ID for data ownership
  analysis: {
    words: Array<{ term: string, detail: string }>;
    grammars: Array<{ point: string, explanation: string }>;
  };
}
```

**Response:**
```typescript
{
  success: true;
  message: string;
  saved: { words_count: number, grammars_count: number };
}
```

## Firestore Structure

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

## Technology Stack

- **Node.js**: 22.x
- **Firebase Functions**: v7.0.2 (latest)
- **Firebase Admin**: v13.6.0
- **TypeScript**: v4.9.5
- **Gemini API**: Google Generative AI

## Testing

```bash
cd functions

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Deployment

### Production Deployment

Functions are compiled automatically by Firebase's `predeploy` hook. Run
`npm --prefix functions run build` directly when you need to validate a
production build before deployment.

```bash
# Deploy all Firebase resources
firebase deploy

# Deploy only functions
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:explain

# Deploy hosting
firebase deploy --only hosting
```

### View Logs

```bash
# View all function logs
firebase functions:log

# View logs for specific function
firebase functions:log --only explain
```

## Security

- Functions use Firebase Secret Manager for API keys
- `saveItems` requires `userId` to be provided for proper data ownership
- Firestore rules enforce user data isolation
- No authentication required for `explain` function

## Version History

- **v1.4** - Updated to Firebase Functions v7.0.2 (latest) with v2 API, improved Secret Manager integration using `defineJsonSecret`, added unit tests
- **v1.3** - Updated to Firebase Functions v6
- **v1.2** - Migrated to Firebase Secret Manager
- **v1.1** - Added v2 prompt support for explain function
- **v1.0** - Initial release with explain and saveItems functions

## Support

For detailed documentation:
- [Functions API Documentation](functions/README.md)
- [Chrome Extension Integration](CHROME_EXTENSION_UPDATE.md)
- [Migration Guide](FUNCTIONS_MIGRATION.md)
- [Testing Guide](functions/TESTING.md)

## License

See LICENSE file for details.
