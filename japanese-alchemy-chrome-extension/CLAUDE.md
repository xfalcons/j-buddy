# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension called "Japanese Alchemy" that helps analyze Japanese language text using AI technology. The extension allows users to:
- Select Japanese text on HTTPS webpages only (content script matches `https://*/*`)
- Get detailed analysis of words, grammar, and example sentences for JLPT N4 levels above
- View results in a side panel with AI-powered explanations

## Architecture and Structure

The extension follows a standard Chrome extension architecture with webpack bundling:

1. **Webpack Build**: `webpack.config.js` bundles all JavaScript and transforms the manifest during build:
   - Entry points are bundled to `dist/scripts/[name].bundle.js`
   - `manifest.json` is transformed at build time to reference bundled paths
   - `sidepanel.html` is generated via HtmlWebpackPlugin with injected script tags
   - Bootstrap (`bootstrap.bundle.min.js`) is copied directly (not bundled)
   - CSS is extracted to `dist/styles/[name].[contenthash].css`

2. **Manifest**: `src/manifest.json` defines the extension's permissions, background service worker, content scripts, and side panel. Note: paths in source manifest are rewritten during build.

3. **Content Script**: `src/scripts/contentScript.js` listens for text selection (`mouseup` event) and sends the selected text to the background service worker via `chrome.runtime.sendMessage()`

4. **Background Service Worker**: `src/scripts/background.js`:
   - Handles extension icon clicks to toggle side panel open/close (tracks per-window state)
   - Receives `textSelected` messages from content script and stores text in `chrome.storage.local`

5. **Side Panel**:
   - `src/sidepanel/sidepanel.html` - UI template
   - `src/sidepanel/sidepanel.js` - Main logic using `marked` library for markdown rendering and custom ruby tag conversion (`{kanji|reading}` format → `<ruby><rb>kanji</rb><rt>reading</rt></ruby>`)

6. **API Service**: `src/scripts/jaAlchemyApiService.js` manages communication with the Japanese Alchemy API. Note: Currently configured for localhost (`http://localhost:8787/api/v1/explain?prompt=v2`) - revert to production URL before releases.

## Development Setup and Commands

### Build Commands
- `npm run build`: Create a production build using webpack
- `npm run watch`: Watch and rebuild development files with webpack
- `npm run clean`: Remove all built files in the dist directory

### Development Workflow
1. Run `npm run watch` to build and watch for changes in development mode
2. Load the extension in Chrome by navigating to `chrome://extensions/` and enabling "Developer mode", then clicking "Load unpacked" and selecting the `dist` directory
3. After changes, the webpack watch will rebuild; click the "Reload" button in `chrome://extensions/`

### Key Files for Customization
1. `src/sidepanel/sidepanel.html` - UI layout and styling
2. `src/sidepanel/sidepanel.js` - Logic for displaying results and handling UI interactions
3. `src/scripts/jaAlchemyApiService.js` - API endpoint configuration (remember to revert localhost URL before releases)
4. `src/manifest.json` - Extension permissions and features (paths are rewritten during build)

## Debugging

Console logs are prefixed for easy identification:
- Background: `[Background]` prefix in `src/scripts/background.js`
- Side panel: `[Sidebar]` prefix in `src/sidepanel/sidepanel.js`

To debug:
1. Side panel: Right-click the side panel and inspect, or use DevTools after opening
2. Background service worker: Go to `chrome://extensions/`, find this extension, click "service worker" link
3. Content script: Open DevTools on the webpage where the content script is running

## Important Implementation Details

- **Ruby Tag Format**: The API returns markdown with `{kanji|reading}` syntax that is converted to HTML `<ruby>` tags in `convertToRuby()` (sidepanel.js:12)
- **Text Length Limits**: Selected text must be 2-500 characters (sidepanel.js:92)
- **Caching**: Last analyzed text and response are stored in `localStorage` to avoid redundant API calls
- **Response Storage**: Selected text is temporarily stored in `chrome.storage.local` for communication between content script and side panel