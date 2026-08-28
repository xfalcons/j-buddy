# J-Buddy

J-Buddy is an AI-assisted Japanese reading companion. Select Japanese text on a
webpage, get an explanation in a Chrome side panel, and save useful vocabulary,
grammar, and complete analyses for later review.

The project is built for intermediate learners reading real Japanese content:
explanations preserve the context in which a learner found the text instead of
treating vocabulary and grammar as isolated flashcards.

## What it includes

- A Chrome MV3 extension that analyzes selected text progressively in a side
  panel, with furigana/ruby annotations.
- Firebase callable functions for batch and streaming analysis, rate limiting,
  and saving learner data.
- A Next.js web app for browsing saved analysis pages, vocabulary, and grammar.
- Managed LLM support for Gemini and ZAI, plus a learner-configured personal
  provider mode in the extension.

## Architecture

```text
Chrome extension
  selection -> background -> side panel
                                |
                                | Firebase callable streaming
                                v
Firebase Functions (explain / explainStreamCallable / saveItems)
  |                             |
  v                             v
LLM provider                  Firestore
  |
  +-- Gemini or ZAI

Next.js web app <------------- Firestore
```

`explainStreamCallable` is the extension's primary analysis path: chunks render
as they arrive. `explain` remains available for batch consumers, while
`saveItems` persists authenticated users' saved content.

## Repository layout

| Directory | Purpose |
| --- | --- |
| `japanese-alchemy-chrome-extension/` | Chrome extension and its Jest tests |
| `japanese-alchemy-hosting/` | Firebase Functions, Firestore rules, and hosting assets |
| `japanese-alchemy-webapp/` | Next.js application and its Vitest tests |
| `docs/` | Architecture decisions, implementation plans, and durable solutions |

## Prerequisites

- Node.js 22 (required by Firebase Functions)
- npm
- Google Chrome or another Chromium browser for extension development
- Firebase CLI (`npm install -g firebase-tools`)
- A Firebase project if you want to run your own backend and web app
- An LLM API credential for local emulator analysis

## Quick start

### 1. Install dependencies

```bash
git clone https://github.com/xfalcons/j-buddy.git
cd j-buddy

npm --prefix japanese-alchemy-chrome-extension install
npm --prefix japanese-alchemy-hosting/functions install
npm --prefix japanese-alchemy-webapp install
```

### 2. Configure local services

Create a local Functions secret override. It is ignored by Git and is used by
the Firebase Emulator Suite instead of production Secret Manager.

```bash
cd japanese-alchemy-hosting/functions
cat > .secret.local <<'EOF'
JAPANESE_ALCHEMY_CONFIG='{"gemini":{"api_url":"https://generativelanguage.googleapis.com/v1beta/openai","api_key":"YOUR_GEMINI_API_KEY","model":"gemini-2.0-flash"},"zai":{"api_url":"YOUR_ZAI_API_URL","api_key":"YOUR_ZAI_API_KEY","model":"YOUR_ZAI_MODEL"}}'
EOF
```

Replace the placeholder values for the provider you intend to use. See the
[Functions README](japanese-alchemy-hosting/functions/README.md#testing-with-emulators)
for the expected JSON shape and supported providers.

For the web app, create its Firebase client configuration:

```bash
cd japanese-alchemy-webapp
cp .env.local.example .env.local
```

Fill in the `NEXT_PUBLIC_FIREBASE_*` values from your Firebase project's web
app settings. Firebase client configuration is public by design; do not put LLM
API keys or service-account credentials in this file.

### 3. Run locally

Start the Functions and Firestore emulators:

```bash
cd japanese-alchemy-hosting/functions
npm run serve
```

In another terminal, build the extension in development mode:

```bash
cd japanese-alchemy-chrome-extension
npm run watch
```

Load `japanese-alchemy-chrome-extension/dist/` as an unpacked extension from
`chrome://extensions` with Developer mode enabled. Development builds connect
callable requests to `127.0.0.1:5001`.

Start the web app in a third terminal:

```bash
cd japanese-alchemy-webapp
npm run dev
```

### Using your own Firebase project

The committed `.firebaserc` files default to the project's `japanese-alchemy`
Firebase project. Before deploying, select your own Firebase project in both
Firebase directories (for example, run `firebase use --add` from each):

```bash
cd japanese-alchemy-hosting
firebase use --add

cd ../japanese-alchemy-webapp
firebase use --add
```

To self-host the full stack, replace the values in
`japanese-alchemy-chrome-extension/src/scripts/firebaseConfig.js` with your own
Firebase web-app configuration and configure the web app's `.env.local`.
Deploy the Functions and Firestore rules, then build and deploy the web app's
Hosting site:

```bash
cd japanese-alchemy-hosting
firebase deploy --only functions,firestore:rules

cd ../japanese-alchemy-webapp
npm run build
firebase deploy --only hosting
```

Before Google sign-in works on a new Hosting domain, add that hostname to
Firebase Authentication's authorized domains.

For production LLM credentials, create the `JAPANESE_ALCHEMY_CONFIG` secret in
Firebase Secret Manager. The detailed provider configuration and deployment
commands are in the [Functions README](japanese-alchemy-hosting/functions/README.md).

## Common commands

| Area | Commands |
| --- | --- |
| Extension | `npm --prefix japanese-alchemy-chrome-extension run build`, `npm --prefix japanese-alchemy-chrome-extension run test`, `npm --prefix japanese-alchemy-chrome-extension run package` |
| Functions | `npm --prefix japanese-alchemy-hosting/functions run build`, `npm --prefix japanese-alchemy-hosting/functions run lint`, `npm --prefix japanese-alchemy-hosting/functions run test` |
| Web app | `npm --prefix japanese-alchemy-webapp run build`, `npm --prefix japanese-alchemy-webapp run lint`, `npm --prefix japanese-alchemy-webapp run test` |

Run the checks relevant to the area you changed before opening a pull request.

## Contributing

We welcome bug reports, documentation improvements, design discussions, and
code contributions. Start with [CONTRIBUTING.md](CONTRIBUTING.md), which
describes our pull-request expectations and validation requirements. If you're
considering a larger change, open an issue or discussion first so we can agree
on the learner problem and scope before implementation.

When working with credentials:

- Never commit API keys, Firebase service-account files, or `.secret.local`.
- Use a personal Firebase project and LLM credentials for local development.
- Treat selected text sent to an analysis provider as user content; test with
  non-sensitive text.

## License

J-Buddy is released under the [MIT License](LICENSE).
