# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

J-Buddy is a Japanese language learning AI assistant with three components in a monorepo:

- **Chrome Extension** (`japanese-alchemy-chrome-extension`) — MV3 side panel extension. User selects Japanese text on any HTTPS page, extension sends it to Firebase Functions for AI analysis (Gemini), and renders results with ruby annotations.
- **Firebase Backend** (`japanese-alchemy-hosting`) — Cloud Functions (`explain`, `explainStream`, `saveItems`) calling Gemini API, with Firestore for persistence. Node.js 22 runtime, deployed to us-central1. `explainStream` uses SSE streaming via `onRequest`; `explain` and `saveItems` use `onCall`.
- **Next.js Webapp** (`japanese-alchemy-webapp`) — Reads Firestore to display saved vocabulary and grammar. Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui.

Auth: Firebase Auth (Google login). Secrets: Firebase Secret Manager (`JAPANESE_ALCHEMY_CONFIG`).

## Architecture

```
Chrome Extension (contentScript → background → sidePanel)
        │  Firebase Callable Functions (onCall)
        ▼
  explain() → Gemini API → full markdown (batch, used by webapp)
  explainStream() → Gemini API (stream: true) → SSE chunks (used by Chrome extension)
  saveItems() → Firestore (users/{userId}/vocabularies, users/{userId}/grammars)
        │
        ▼
  Next.js Webapp (reads Firestore, shows saved items)
```

**Data flow**: Text selection → contentScript sends to background → stored in chrome.storage.local → sidePanel reads it → calls `jaAlchemyApiService.generateResponseStream()` → Firebase `explainStream` HTTP endpoint → Gemini API (streaming) → results rendered progressively with ruby tag conversion. On stream completion, `formatAnalysisResult()` produces structured data (checkboxes, save JSON).

The `explain` callable is preserved for backward compatibility; the Chrome extension uses the streaming `explainStream` endpoint. See `docs/SSE_STREAMING_MIGRATION.md` for details.

## Build & Development Commands

### Chrome Extension
```bash
cd japanese-alchemy-chrome-extension
npm install
npm run build          # webpack production build → dist/
npm run watch          # webpack watch mode (development)
npm run clean          # rm dist/*
npm test               # jest
npm run test:watch     # jest --watch
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

Deploy Firestore rules: `cd japanese-alchemy-hosting && firebase deploy --only firestore:rules`

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
- **Prompt versions**: `v1` (basic) and `v2` (with ruby annotations, default). Selected via query param `?prompt=v2` on the explain endpoint.
- **Text limits**: Analysis accepts 2–500 characters of Japanese text.
- **Chrome extension config**: `jaAlchemyApiService.js` contains the API URL — it's currently set to localhost for development. Must be reverted to production URL before releases.
- **Console log prefixes**: `[Background]` in background.js, `[Sidebar]` in sidepanel.js.
- **Path aliases**: Webapp uses `@/*` mapping to `./lib/*` and `./components/*`.
- **Firestore security rules**: Users can only read/write their own data under `users/{userId}/`.
