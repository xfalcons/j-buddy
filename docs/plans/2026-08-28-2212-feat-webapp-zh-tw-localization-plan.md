---
title: "feat: Update webapp interface language to zh-TW (繁體中文)"
type: feat
date: 2026-08-28T22:12:00+08:00
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

## Goal Capsule

**Objective:** Translate all user-facing UI strings in the Next.js webapp from English to 繁體中文 (zh-TW), and rebrand the product name from "Japanese Alchemy" to "J-Buddy: Learning Hub".

**Means:** Direct string replacement across the webapp's page and component files — no i18n framework or translation infrastructure is introduced. The `<html lang>` attribute and date formatting locale are also updated to reflect zh-TW.

**Authority:** User-directed decisions (session-settled).

**Stop conditions:** All hardcoded English UI strings in the webapp are translated to zh-TW; the brand name is updated everywhere it appears; `<html lang>` and `toLocaleDateString` locale are set to zh-TW.

---

## Product Contract

### Summary

The webapp currently renders all UI labels, headings, buttons, empty-state messages, and metadata in English. This plan replaces every user-facing English string with 繁體中文 (zh-TW), updates the HTML language attribute, switches date formatting to the zh-TW locale, and rebrands the product from "Japanese Alchemy" to "J-Buddy: Learning Hub".

### Problem Frame

The webapp serves a Japanese-learning audience that reads Traditional Chinese. The current English interface creates a language barrier for these users. Translating the UI to zh-TW improves accessibility and aligns the webapp with the target audience's primary language. The product is also being rebranded from "Japanese Alchemy" to "J-Buddy: Learning Hub", which must be reflected in all user-visible surfaces.

### Requirements

**Translation scope**

- R1. All user-facing UI strings in `app/page.tsx` (dashboard) are translated to zh-TW, including: header brand name, tab labels, section headings, section descriptions, empty-state messages, button labels, the "Shared" badge, "Source" link text, and the loading state text.
- R2. All user-facing UI strings in `app/auth/page.tsx` (auth page) are translated to zh-TW, including: card title, card description (sign in / sign up), form labels, button labels, loading text, Google sign-in button, toggle link text, and the "Or continue with" divider text.
- R3. The `sr-only` accessibility strings in `components/ui/theme-toggle.tsx` ("Toggle theme", "Switch to light mode", "Switch to dark mode") and `components/ui/dialog.tsx` ("Close") are translated to zh-TW.
- R4. The `<html lang="en">` attribute in `app/layout.tsx` is changed to `zh-Hant` (the correct BCP 47 tag for Traditional Chinese).

**Branding**

- R5. The product name "Japanese Alchemy" is replaced with "J-Buddy: Learning Hub" everywhere it appears in the webapp: `app/layout.tsx` metadata `title` and `description`, `app/page.tsx` header `<h1>`, and `app/auth/page.tsx` card title.

**Locale formatting**

- R6. All `toLocaleDateString()` calls in `app/page.tsx` are updated to use the `zh-TW` locale (e.g. `toLocaleDateString('zh-TW')`) so dates render in Traditional Chinese format.

**Metadata**

- R7. The `metadata.description` in `app/layout.tsx` is translated to zh-TW.

### Scope Boundaries

- No i18n framework (next-intl, react-i18next, etc.) is introduced. Strings are replaced in place.
- No changes to the Chrome extension or Firebase Functions — this plan is webapp-only.
- No changes to Firestore data, schema, or service layer (`firestoreService.ts`).
- No changes to user-generated content (vocabulary terms, grammar explanations, analysis page markdown) — these are LLM-generated and stored in Japanese; only the chrome UI around them is translated.
- No changes to the `lib/textUtils.ts` rendering pipeline (furigana parsing, markdown conversion, sanitization).
- The brand name in the Chrome extension and Firebase Functions is out of scope for this plan.
- shadcn/ui primitive components (`button.tsx`, `input.tsx`, `card.tsx`, `badge.tsx`, `alert.tsx`, `label.tsx`, `textarea.tsx`, `tabs.tsx`) contain no user-facing strings and are not modified.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Direct string replacement, no i18n framework. (session-settled: user-directed — chosen over introducing a translation library: the target is a single language, and the project has no existing i18n infrastructure to extend.) The webapp is small enough (4 files with user-facing strings) that inline replacement is the simplest correct approach. A library would add dependency weight and indirection for no current benefit.
- KTD2. Brand name changed to "J-Buddy: Learning Hub". (session-settled: user-directed — chosen over keeping "Japanese Alchemy" or translating to Chinese: user explicitly specified the new brand name.) Applied uniformly across metadata, header, and auth card title.
- KTD3. HTML `lang` attribute set to `zh-Hant` rather than `zh-TW`. `zh-Hant` is the BCP 47 script-based tag preferred for HTML documents; `zh-TW` is the region-based tag used for locale APIs like `toLocaleDateString`. Using both in their appropriate contexts follows convention.

---

## Implementation Units

### U1. Translate dashboard page (`app/page.tsx`)

**Goal:** Replace all English UI strings in the dashboard with zh-TW, update brand name, and switch date formatting to zh-TW locale.

**Files:** `app/page.tsx`

**Strings to translate:**

| Current English | zh-TW translation |
|---|---|
| `Loading...` | `載入中...` |
| `Japanese Alchemy` (header `<h1>`) | `J-Buddy: Learning Hub` |
| `Sign Out` | `登出` |
| `Sign In` | `登入` |
| `Vocabularies ({count})` | `單字 ({count})` |
| `Grammars ({count})` | `文法 ({count})` |
| `Pages ({count})` | `頁面 ({count})` |
| `Shared Pages ({count})` | `共享頁面 ({count})` |
| `My Vocabularies` | `我的單字` |
| `Shared Vocabularies` | `共享單字` |
| `View your Japanese vocabulary collection` | `查看你的日語單字收藏` |
| `Browse Japanese vocabulary shared by the community` | `瀏覽社群共享的日語單字` |
| `No vocabularies found.` | `找不到單字。` |
| `My Grammars` | `我的文法` |
| `Shared Grammars` | `共享文法` |
| `View your Japanese grammar points` | `查看你的日語文法重點` |
| `Browse Japanese grammar points shared by the community` | `瀏覽社群共享的日語文法重點` |
| `No grammar points found.` | `找不到文法重點。` |
| `My Pages` | `我的頁面` |
| `Browse your saved analysis pages` | `瀏覽你儲存的分析頁面` |
| `No analysis pages found.` | `找不到分析頁面。` |
| `Delete` | `刪除` |
| `Shared Pages` (heading) | `共享頁面` |
| `Browse analysis pages shared by other learners` | `瀏覽其他學習者共享的分析頁面` |
| `No shared analysis pages found.` | `找不到共享分析頁面。` |
| `Shared` (badge) | `共享` |
| `Source` (link) | `來源` |

**Date formatting:** Change all `new Date(...).toLocaleDateString()` calls to `new Date(...).toLocaleDateString('zh-TW')`.

**Patterns:** Direct in-place string replacement. No structural or logic changes.

**Test Scenarios:**
- Verify no English UI strings remain in the rendered dashboard (authenticated and unauthenticated states).
- Verify tab labels display Chinese text with correct count interpolation.
- Verify empty-state messages render in zh-TW for each tab.
- Verify dates render in zh-TW locale format (e.g. `2026/8/28`).
- Verify "Shared" badge and "Source" link render in Chinese.

**Verification:** `cd japanese-alchemy-webapp && npm run build` succeeds; `npm run lint` passes; visual inspection of rendered dashboard.

---

### U2. Translate auth page (`app/auth/page.tsx`)

**Goal:** Replace all English UI strings in the auth page with zh-TW and update brand name.

**Files:** `app/auth/page.tsx`

**Strings to translate:**

| Current English | zh-TW translation |
|---|---|
| `Japanese Alchemy` (card title) | `J-Buddy: Learning Hub` |
| `Create an account` | `建立帳號` |
| `Sign in to your account` | `登入你的帳號` |
| `Email` | `電子郵件` |
| `Password` | `密碼` |
| `Loading...` | `載入中...` |
| `Sign Up` | `註冊` |
| `Sign In` | `登入` |
| `Or continue with` | `或使用以下方式繼續` |
| `Google` | `Google` (brand name, unchanged) |
| `Already have an account? Sign in` | `已有帳號？登入` |
| `Don't have an account? Sign up` | `還沒有帳號？註冊` |
| `An error occurred` (fallback error) | `發生錯誤` |

**Patterns:** Direct in-place string replacement. No structural or logic changes.

**Test Scenarios:**
- Verify auth page renders all labels and buttons in zh-TW in both sign-in and sign-up modes.
- Verify toggle link text switches correctly between modes.
- Verify fallback error message renders in Chinese when an error has no message.

**Verification:** `cd japanese-alchemy-webapp && npm run build` succeeds; `npm run lint` passes; visual inspection of auth page in both modes.

---

### U3. Translate accessibility strings in shared UI components

**Goal:** Translate `sr-only` and `title` accessibility strings in theme-toggle and dialog components.

**Files:** `components/ui/theme-toggle.tsx`, `components/ui/dialog.tsx`

**Strings to translate:**

| File | Current English | zh-TW translation |
|---|---|---|
| `theme-toggle.tsx` | `Switch to light mode` (title) | `切換至淺色模式` |
| `theme-toggle.tsx` | `Switch to dark mode` (title) | `切換至深色模式` |
| `theme-toggle.tsx` | `Toggle theme` (sr-only) | `切換主題` |
| `dialog.tsx` | `Close` (sr-only) | `關閉` |

**Patterns:** Direct in-place string replacement in JSX attribute values.

**Test Scenarios:**
- Verify theme toggle button `title` attribute updates on click (light/dark).
- Verify dialog close button has Chinese `sr-only` text.

**Verification:** `cd japanese-alchemy-webapp && npm run build` succeeds; `npm run lint` passes.

---

### U4. Update layout metadata and HTML lang attribute (`app/layout.tsx`)

**Goal:** Update `<html lang>`, translate metadata, and apply new brand name to metadata.

**Files:** `app/layout.tsx`

**Changes:**

| Current | Updated |
|---|---|
| `<html lang="en">` | `<html lang="zh-Hant">` |
| `title: "Japanese Alchemy - Vocabulary & Grammar Study"` | `title: "J-Buddy: Learning Hub - 單字與文法學習"` |
| `description: "A Japanese vocabulary and grammar study application built with Next.js, shadcn/ui, and Firebase"` | `description: "一個使用 Next.js、shadcn/ui 和 Firebase 構建的日語單字與文法學習應用程式"` |

**Patterns:** Direct attribute and string replacement.

**Test Scenarios:**
- Verify `<html>` element has `lang="zh-Hant"` in the rendered DOM.
- Verify document `<title>` and meta description are in zh-TW with new brand name.

**Verification:** `cd japanese-alchemy-webapp && npm run build` succeeds; `npm run lint` passes; inspect page source.

---

## Verification Contract

| Gate | Command | Applies to |
|---|---|---|
| Build | `cd japanese-alchemy-webapp && npm run build` | U1–U4 |
| Lint | `cd japanese-alchemy-webapp && npm run lint` | U1–U4 |
| Tests | `cd japanese-alchemy-webapp && npm run test` | U1–U4 (existing tests should still pass — no logic changes) |
| Visual | `npm run dev` and manually inspect dashboard (auth + unauth), auth page, theme toggle, dialog | U1–U4 |

---

## Definition of Done

- All user-facing English strings in the webapp are translated to zh-TW per the string tables in U1–U4.
- The brand name "J-Buddy: Learning Hub" appears in all locations previously showing "Japanese Alchemy".
- `<html lang="zh-Hant">` is set.
- All `toLocaleDateString()` calls use `'zh-TW'` locale.
- `npm run build`, `npm run lint`, and `npm run test` all pass.
- No user-facing English strings remain in the webapp UI chrome.
