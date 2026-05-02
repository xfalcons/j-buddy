# SSE Streaming Migration

This document describes the migration of the `explain` pipeline from synchronous batch responses to Server-Sent Events (SSE) streaming, enabling progressive rendering of AI analysis results.

## Problem

The original `explain` flow was fully synchronous:

```
sidepanel → await httpsCallable('explain') → Firebase Function → await Gemini /chat/completions → full markdown response → render once
```

Users stared at a spinner for the entire duration of Gemini's generation (often 5-10 seconds for the v2 prompt, which produces vocabulary conjugation tables and grammar analysis totaling 2000+ tokens). No feedback was shown until the entire response completed.

## Solution

Add an SSE streaming endpoint alongside the existing callable. The Chrome extension switches to streaming; the original `explain` callable is preserved for backward compatibility.

```
sidepanel → fetch(explainStream) → Firebase onRequest → Gemini /chat/completions (stream: true)
                ↑                                                              ↓
                ←────── SSE chunks (text/event-stream) ←─── iterates Gemini SSE body ←─┘
```

## Architecture

### Before

```
Chrome Extension Sidepanel
  │
  │  Firebase Callable (httpsCallable)
  │  ─ request: {content, prompt} ─►
  │  ◄─ response: {success, data, timestamp} ──
  │       (full markdown, delivered once)
  ▼
  formatAnalysisResult(markdown) → innerHTML set once
```

### After

```
Chrome Extension Sidepanel
  │
  │  HTTP POST (fetch + ReadableStream)
  │  ─ request: {content, prompt} ─►
  │  ◄─ SSE event: chunk {content} ──── (progressive, every ~100ms)
  │  ◄─ SSE event: chunk {content} ────
  │  ◄─ SSE event: chunk {content} ────
  │  ◄─ SSE event: done [DONE] ────────
  ▼
  During streaming:  convertToRuby() + marked.parse() on accumulated text (throttled 80ms)
  On completion:     formatAnalysisResult(fullText) → final render with checkboxes + save data
```

## Files Changed

### Backend — `japanese-alchemy-hosting/functions/`

| File | Change | Purpose |
|------|--------|---------|
| `src/models/types.ts` | Added `stream?: boolean` to `GeminiRequest` | Type support for streaming requests |
| `src/services/geminiService.ts` | Added `geminiStreamCompletion()` method | Calls Gemini with `stream: true`, returns raw `Response` for caller to iterate |
| `src/v1/explainStreamHandler.ts` | **New file** | `onRequest` handler: validates input, sets SSE headers, pipes Gemini SSE chunks to client |
| `src/index.ts` | Exported `explainStream` via `onRequest` | New HTTP endpoint with `cors: true`, `timeoutSeconds: 120` |

### Client — `japanese-alchemy-chrome-extension/`

| File | Change | Purpose |
|------|--------|---------|
| `src/scripts/jaAlchemyApiService.js` | Added `streamUrl` in constructor | Derives streaming endpoint URL from Firebase project ID |
| `src/scripts/jaAlchemyApiService.js` | Added `generateResponseStream()` method | Consumes SSE via `fetch` + `ReadableStream`, calls `onChunk`/`onDone`/`onError` callbacks |
| `src/sidepanel/sidepanel.js` | Added `renderStreamingPreview()` | Throttled progressive renderer (80ms) — `convertToRuby` + `marked.parse` on accumulated text |
| `src/sidepanel/sidepanel.js` | Rewrote `analizingSelectedText()` | Switched from `generateResponse()` to `generateResponseStream()` with progressive rendering |

### Unchanged

- `explain` callable function (preserved for webapp / backward compat)
- `saveItems` callable function
- `formatAnalysisResult()` — called on stream completion, same as before
- `sidepanel.html` — no HTML structure changes
- `saveForLaterJson`, localStorage caching, copy, save — all unchanged
- Next.js webapp, Firestore rules, data model — unaffected

## SSE Protocol

The `explainStream` endpoint uses typed SSE events:

### Client → Server (HTTP POST)

```json
{
  "content": "選取的日文文字",
  "prompt": "v2"
}
```

### Server → Client (SSE stream)

```
event: chunk
data: {"content": "### "}

event: chunk
data: {"content": "原句\n"}

event: chunk
data: {"content": "  - この{漢字|かんじ}"}

...

event: done
data: [DONE]
```

On error:

```
event: error
data: {"error": "Gemini API error: 429 Rate limit exceeded"}
```

## Progressive Rendering Strategy

The sidepanel rendering has two phases:

### Phase 1 — Streaming (progressive preview)

1. Spinner shown while connection is established
2. On first chunk: spinner hidden, result container shown
3. Each chunk appends to an accumulated buffer
4. `renderStreamingPreview()` re-parses markdown at most every 80ms (throttled)
5. Preview shows raw formatted text (ruby annotations, markdown headings) — no checkboxes yet

### Phase 2 — Completion (final render)

1. On `done` event: clear throttle timer
2. Run `formatAnalysisResult(fullText)` on the complete text
3. Replace preview HTML with fully formatted result:
   - Section splitting (單字分析 / 文法分析)
   - Checkboxes on `<h4>` headings for save-for-later selection
   - Structured JSON extraction for `saveForLaterJson`
4. Cache full response in `localStorage`
5. Save and copy functionality now available

## Deployment

```bash
# 1. Deploy the new function
cd japanese-alchemy-hosting
firebase deploy --only functions

# 2. Rebuild the extension
cd japanese-alchemy-chrome-extension
npm run build

# 3. Reload extension in chrome://extensions
```

The `streamUrl` in `jaAlchemyApiService.js` must point to the correct endpoint:
- **Local dev**: `http://127.0.0.1:5001/{projectId}/us-central1/explainStream`
- **Production**: `https://us-central1-{projectId}.cloudfunctions.net/explainStream`

## Risks

| Risk | Mitigation |
|------|------------|
| Gemini streaming format differs from expected OpenAI SSE spec | The handler parses `choices[0].delta.content` from each `data:` line — standard OpenAI-compatible format |
| Firebase Function timeout during slow generation | `timeoutSeconds: 120` on `explainStream` (vs default 60s) |
| Client re-renders on every chunk cause jank | Throttled to 80ms via `renderStreamingPreview()` |
| Chrome extension CORS blocked | `cors: true` on the `onRequest` function allows all origins |
| Stream interrupted mid-response | Client delivers partial results via `onDone(fullText)` if any text was received |
