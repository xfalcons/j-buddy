# Ja Alchemy - Japanese Language Analysis Extension

A Chrome extension that helps analyze Japanese language using modern AI technology. Select text on any webpage to get detailed analysis of Japanese words, grammar, and example sentences for JLPT N4 levels above.

## Features
- Analyze Japanese words and sentences with AI assistance
- Compare two Japanese words with readings and pitch accents
- Get detailed grammar explanations
- See example sentences for JLPT N4 levels above
- Large, readable sidebar window for comfortable reading
- Sign in with Google for personalized experience
- Save analyses for later review on Japanese Alchemy Web Site
- Vocabulary with complete verb conjugations (完整動詞變化)
- Toolbar with FontSize selection, Copy to Clipboard, and Save to File in Markdown format
- Light/Dark mode toggle

## Architecture

```text
+-----------------------------+
| Web page selection          |
+--------------+--------------+
               |
               v
+--------------+--------------+
| Content script              |
+--------------+--------------+
               |
               v
+--------------+--------------+
| Background service worker   |
+--------------+--------------+
               |
               v
+--------------+--------------+
| chrome.storage.local        |
+--------------+--------------+
               |
               v
+--------------+--------------+
| Side panel                  |
+--------------+--------------+
               |
               v
               +-----------------------------------------------+
               |                                               |
               v                                               v
+--------------+--------------+                 +--------------+--------------+
| Firebase callable functions |                 | Personal LLM provider API   |
+-----------------------------+                 +-----------------------------+
```

The content script sends the selection to the background service worker, which
stores it for the side panel. Managed-provider analysis uses Firebase callable
streaming; personal-provider mode calls the learner-configured provider API
directly.

## Installation
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked" and select this directory

## Usage
1. Install the extension
4. Select Japanese text on any webpage
5. Click the extension icon to see the analysis

The analysis includes:
- Word readings and pitch accents (for word comparisons)
- Grammar explanations
- Usage differences
- Example sentences for JLPT N4 levels above

## Development
- Modify `sidebar/sidebar.html` and `sidebar/sidebar.js` to customize the sidebar UI and functionality
- Edit `background.js` to add background tasks
- Update `manifest.json` to add new permissions or features

### Managed-provider emulator mode

Use this workflow to test progressive managed-provider analysis against the
Firebase Local Emulator Suite:

1. In `japanese-alchemy-hosting/functions`, create the Git-ignored
   `.secret.local` file described in the [Functions README](../japanese-alchemy-hosting/functions/README.md#testing-with-emulators).
2. Start the Functions and Firestore emulators:

   ```bash
   cd ../japanese-alchemy-hosting/functions
   npm run serve
   ```

3. Build the development extension and load (or reload) its `dist/` directory
   from `chrome://extensions`:

   ```bash
   cd ../../japanese-alchemy-chrome-extension
   npm run watch
   ```

   Development builds route Firebase callable requests to
   `127.0.0.1:5001`; production builds from `npm run build` keep using the
   deployed Functions service. Reload the unpacked extension after switching
   build modes so Chrome applies the development-only loopback permission.
4. Select Japanese text and open the side panel. Chunks should appear
   progressively, while the Emulator Suite terminal (or Emulator UI) logs the
   `explainStreamCallable` request. Firestore rate-limit documents stay in the
   Firestore emulator.

## Promotion

### v1.0.0

正在學日文的你，瀏覽日文網站，還在剪剪貼貼嗎？有了
【Japanese Alchemy 伴讀日文的AI魔法小幫手】
你就可以翻譯，單字，文法一次擁有，還不快來下載！https://chromewebstore.google.com/detail/cbibkfdcmfbgjbmingopkjfhngilhejd?utm_source=item-share-cb
