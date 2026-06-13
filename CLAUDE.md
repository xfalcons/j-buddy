# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

J-Buddy is a Japanese language learning AI assistant with three components in a monorepo:

- **Chrome Extension** (`japanese-alchemy-chrome-extension`) — MV3 side panel extension. User selects Japanese text on any HTTPS page, extension sends it to Firebase Functions for AI analysis, and renders results with ruby annotations.
- **Firebase Backend** (`japanese-alchemy-hosting`) — Cloud Functions (`explain`, `explainStream`, `saveItems`) backed by a pluggable LLM service layer (currently Gemini and ZAI, both using OpenAI-compatible `/chat/completions` endpoints), with Firestore for persistence. Node.js 22 runtime, deployed to us-central1. `explainStream` uses SSE streaming via `onRequest`; `explain` and `saveItems` use `onCall`.
- **Next.js Webapp** (`japanese-alchemy-webapp`) — Reads Firestore to display saved vocabulary and grammar. Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui.

Auth: Firebase Auth (Google login). Secrets: Firebase Secret Manager (`JAPANESE_ALCHEMY_CONFIG`).

## Architecture

```
Chrome Extension (contentScript → background → sidePanel)
        │  Firebase Callable Functions (onCall)
        ▼
  explain()     → LLM (batch)     → full markdown (used by webapp)
  explainStream() → LLM (stream: true) → SSE chunks (used by Chrome extension)
  saveItems()     → Firestore
        │
        ▼
  Next.js Webapp (reads Firestore, shows saved items)

LLM Service Layer (abstraction over providers):
  createLlmService() → LlmService
  ├── GeminiLlmService  (config: config.gemini, uses Google thinking_config)
  └── ZaiLlmService     (config: config.zai)
  Both use OpenAI-compatible /chat/completions endpoint.
  Switch provider by changing LLM_PROVIDER in config.ts.
```

**Data flow**: Text selection → contentScript sends to background → stored in chrome.storage.local → sidePanel reads it → calls `jaAlchemyApiService.generateResponseStream()` → Firebase `explainStream` HTTP endpoint → LLM API (streaming) → results rendered progressively with ruby tag conversion. On stream completion, `formatAnalysisResult()` produces structured data (checkboxes, save JSON).

The `explain` callable is preserved for backward compatibility; the Chrome extension uses the streaming `explainStream` endpoint. See `docs/SSE_STREAMING_MIGRATION.md` for details.

## Build & Development Commands

### Chrome Extension
```bash
cd japanese-alchemy-chrome-extension
npm install
npm run build          # webpack production build → dist/
npm run watch          # webpack watch mode (development)
npm run test           # jest
npm run test:watch     # jest --watch
npm run package        # build + zip → release/ja-<version>.zip
```
Load `dist/` as unpacked extension in chrome://extensions.

### Firebase Functions
```bash
cd japanese-alchemy-hosting/functions
npm install
npm run build          # tsc → lib/
npm run build:watch    # tsc --watch
npm run serve          # build + firebase emulators:start --only functions
npm run deploy         # firebase deploy --only functions
npm run lint           # eslint
npm test               # jest
```

For local dev, place a `secrets.json` file in `functions/` with the `JAPANESE_ALCHEMY_CONFIG` payload (see `functions/README.md`).

Deploy Firestore rules: `cd japanese-alchemy-hosting && firebase deploy --only firestore:rules`

### Switching LLM Provider

Edit `LLM_PROVIDER` in `functions/src/config.ts` — valid values: `"gemini"` (default) or `"zai"`. Both providers use the OpenAI-compatible `/chat/completions` protocol. Credentials are stored in Firebase Secret Manager under `JAPANESE_ALCHEMY_CONFIG` as a JSON object with `gemini` and `zai` sub-objects (each with `api_url`, `api_key`, `model`).

### Next.js Webapp
```bash
cd japanese-alchemy-webapp
npm install
cp .env.local.example .env.local   # fill in Firebase config
npm run dev            # next dev
npm run build          # next build
npm run lint           # eslint
```

## Key Implementation Details

- **Ruby tag format**: API returns `{kanji|reading}` which is converted to `<ruby><rb>kanji</rb><rt>reading</rt></ruby>` in both the chrome extension sidepanel and the webapp's `textUtils.ts`.
- **Prompt versions**: `v1` (basic) and `v2` (with ruby annotations, default). Defined in `functions/src/models/systemPromptV1.ts` and `systemPromptV2.ts`. Selected via request body field `prompt`.
- **Text limits**: Analysis accepts 2–500 characters of Japanese text.
- **LLM service abstraction** (`functions/src/services/llmService.ts`): Factory function `createLlmService()` returns the active provider. Both Gemini and ZAI use the OpenAI-compatible `POST /chat/completions` endpoint. Gemini additionally sends `extra_body.google.thinking_config` for Gemini-specific features.
- **Chrome extension config**: `jaAlchemyApiService.js` derives its streaming URL from `firebaseConfig.projectId` (e.g. `https://us-central1-{projectId}.cloudfunctions.net/explainStream`). The `explain` batch method also uses the derived URL.
- **Console log prefixes**: `[Background]` in background.js, `[Sidebar]` in sidepanel.js.
- **Path aliases**: Webapp uses `@/*` mapping to `./lib/*` and `./components/*`.
- **Firestore security rules**: Users can only read/write their own data under `users/{userId}/`.
- **Package command**: `npm run package` in the chrome extension builds and creates `release/ja-<version>.zip`.
- **Functions runtime**: Node.js 22, deployed to `us-central1`, project ID: `japanese-alchemy`.
