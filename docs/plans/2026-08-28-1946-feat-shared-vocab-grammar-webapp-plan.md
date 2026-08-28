---
title: Shared Vocabulary and Grammar in Webapp - Plan
type: feat
date: 2026-08-28
topic: shared-vocab-grammar-webapp
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

## Goal Capsule

- **Objective:** Authenticated learners browsing the webapp can see shared vocabulary and shared grammar items merged into the existing Vocabularies and Grammars tabs, visually distinguished from personal items with a "Shared" badge and source attribution, and can no longer import individual vocab/grammar items from the Shared Pages tab.
- **Product authority:** This plan covers webapp display, webapp Firestore service reads, and Firestore security rules for the shared vocab/grammar collections. Backend save logic and Chrome extension behavior are not active scope.
- **Open blockers:** None.

## Product Contract

### Summary

Merge shared vocabulary and shared grammar items into the existing Vocabularies and Grammars tabs alongside personal items, with a "Shared" badge and source attribution (source text and source URL) on shared cards. Remove the per-item import section from the Shared Pages tab so shared pages become read-only analysis browsing. Open Firestore read rules for the `shared_vocabularies` and `shared_grammars` root collections to authenticated learners.

### Problem Frame

When a logged-out learner saves an analysis with the shared flag, the backend successfully writes vocabulary, grammar, and analysis-page items to three root collections: `shared_vocabularies`, `shared_grammars`, and `shared_analysis_pages`. The webapp only reads `shared_analysis_pages` — it has no service functions to read shared vocab or grammar, no UI to display them, and the Firestore rules deny client reads on those two collections. The shared data is effectively write-only from the webapp's perspective. Additionally, the Shared Pages tab currently carries an import section that duplicates the purpose of having standalone shared vocab/grammar collections — the user has decided to remove that import path and make shared collections the sole browsing source for shared items.

### Requirements

**Shared data reading**

- R1. The webapp Firestore service can read all documents from the `shared_vocabularies` root collection, ordered newest-first by `createdAt`.
- R2. The webapp Firestore service can read all documents from the `shared_grammars` root collection, ordered newest-first by `createdAt`.
- R3. Shared vocabulary items carry the same fields as personal vocabulary items (`term`, `detail`, `createdAt`) plus an optional `metadata` object containing `source_text`, `source_url`, and `saved_at`.
- R4. Shared grammar items carry the same fields as personal grammar items (`point`, `explanation`, `createdAt`) plus the same optional `metadata` object.

**Merged tab display**

- R5. The Vocabularies tab displays personal vocabulary items and shared vocabulary items together in the existing card grid.
- R6. The Grammars tab displays personal grammar items and shared grammar items together in the existing card list.
- R7. Shared items are visually distinguished from personal items by a "Shared" badge on the card.
- R8. Shared item cards display source attribution: the `source_text` from metadata rendered with ruby annotations, and a clickable "Source" link when `source_url` is a valid http(s) URL.
- R9. Shared item cards do not show a delete button (only personal items are deletable).
- R10. The tab counts in the Vocabularies and Grammars tab triggers reflect the merged total of personal plus shared items.

**Shared Pages simplification**

- R11. The Shared Pages tab no longer renders the "Import items" section (the structured_json words/grammars list with per-item import buttons).
- R12. The Shared Pages tab retains read-only display of the analysis page content: source text, rendered markdown, source link, and date.

**Firestore rules**

- R13. The Firestore security rules allow authenticated users to read documents in the `shared_vocabularies` collection.
- R14. The Firestore security rules allow authenticated users to read documents in the `shared_grammars` collection.
- R15. Client writes and deletes on `shared_vocabularies` and `shared_grammars` remain denied; only the Admin SDK (Cloud Functions) can write.

### Key Decisions

- KTD1. Merge shared items into existing tabs rather than dedicated shared tabs. Keeps the tab count at four and avoids fragmenting the browsing experience. Learners see everything in one place with a badge to distinguish provenance. (session-settled: user-directed — chosen over dedicated tabs or shared-pages-only: one browsing surface, badge distinguishes provenance)
- KTD2. Remove the import-vocab/grammar section from Shared Pages. The standalone shared collections become the sole source for browsing shared vocab/grammar, eliminating the duplicated import path. (session-settled: user-directed — chosen over keeping the import section: shared collections own browsing, no duplicate path)
- KTD3. Show a "Shared" badge plus source attribution (source text + source URL) on shared cards. Badge alone was considered but the user chose to also surface where the shared item came from. (session-settled: user-directed — chosen over badge-only: source attribution helps learners trace provenance)
- KTD4. Open Firestore read rules for `shared_vocabularies` and `shared_grammars` to authenticated users, matching the existing `shared_analysis_pages` pattern. Writes and deletes remain Admin SDK only.

### Success Criteria

- An authenticated learner with no personal vocab sees shared vocabulary items in the Vocabularies tab, each marked with a "Shared" badge and source attribution.
- An authenticated learner with personal and shared grammar items sees both in the Grammars tab, with shared items badged and personal items retaining their delete button.
- The Shared Pages tab displays analysis page content without any import buttons.
- The Firestore rules permit authenticated client reads on `shared_vocabularies` and `shared_grammars` but deny client writes and deletes.

### Scope Boundaries

- No changes to backend save logic (`saveItemsCallable`, `FirestoreService` in functions) — the save flow already writes to all three shared collections correctly.
- No changes to the Chrome extension — the save flow and shared flag behavior are unchanged.
- No filtering, search, or pagination within shared items (existing pattern loads all; shared collections are expected to stay small).
- The `structured_json` field remains in the shared analysis pages data model; only the UI import section is removed.
- No changes to the `shared_analysis_pages` Firestore rules or service function — that path already works.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Extend the existing `Vocabulary` and `Grammar` interfaces with an optional `metadata` field and an optional `isShared` boolean flag, rather than creating separate shared-item types. Shared items use the same card rendering path with conditional badge/attribution/delete logic. Governs R3, R4, R5, R6, R7, R8, R9. (session-settled: user-directed — merge into existing tabs, chosen over dedicated tabs: one surface, badge distinguishes)
- KTD2. Add `getSharedVocabularies()` and `getSharedGrammars()` service functions mirroring the existing `getSharedAnalysisPages()` pattern — root collection, `orderBy('createdAt', 'desc')`, `timestampToDate` conversion. Governs R1, R2.
- KTD3. Remove the entire `structured_json` import block from the Shared Pages `TabsContent` in `page.tsx`, including the `handleImportVocabulary` and `handleImportGrammar` handlers and the `importVocabulary`/`importGrammar` service functions they call. Governs R11, R12. (session-settled: user-directed — remove import section, chosen over keeping it: shared collections own browsing)
- KTD4. Add Firestore rules for `shared_vocabularies` and `shared_grammars` matching the `shared_analysis_pages` pattern: `allow read: if isAuthenticated()` with no write or delete rules. Governs R13, R14, R15.

### Assumptions

- Shared vocab/grammar items in Firestore carry a `metadata` object with `source_text`, `source_url`, and `saved_at` (verified in `japanese-alchemy-hosting/functions/src/services/firestoreService.ts` lines 41–48 and 80–87). If `metadata` is absent on older items, the badge still shows but source attribution is omitted gracefully.
- The `createdAt` field on shared items is a numeric timestamp (epoch millis), matching the backend's `Date.now()` — the existing `timestampToDate` helper already handles numeric values.

---

## Implementation Units

### U1. Add shared vocab/grammar service functions and extend types

- **Goal:** Enable the webapp to read shared vocabulary and grammar from Firestore root collections.
- **Files:** `japanese-alchemy-webapp/services/firestoreService.ts`, `japanese-alchemy-webapp/types/index.ts`
- **Patterns:** Follow the existing `getSharedAnalysisPages()` function shape — root `collection(db, 'shared_*')`, `query(..., orderBy('createdAt', 'desc'))`, `getDocs`, map with `timestampToDate`.
- **Technical design:** Add `getSharedVocabularies(): Promise<Vocabulary[]>` reading `shared_vocabularies`, and `getSharedGrammars(): Promise<Grammar[]>` reading `shared_grammars`. Extend `Vocabulary` and `Grammar` interfaces with `metadata?: { source_text?: string; source_url?: string; saved_at?: string }` and `isShared?: boolean` to support shared-item rendering without a separate type. Remove `importVocabulary` and `importGrammar` functions — they are no longer called after U3 removes the import handlers.
- **Test scenarios:** `japanese-alchemy-webapp/services/firestoreService.test.ts`
  - `getSharedVocabularies` reads `shared_vocabularies` collection ordered newest-first — mock `getDocs` returns vocab docs with `term`, `detail`, `createdAt`; assert collection name and `orderBy('createdAt', 'desc')`.
  - `getSharedGrammars` reads `shared_grammars` collection ordered newest-first — same shape with `point`, `explanation`.
  - Shared vocab items with `metadata` field are mapped through correctly — assert `metadata.source_text` survives the spread.
  - Shared vocab items without `metadata` do not throw — assert graceful mapping.
  - Numeric `createdAt` timestamps convert to `Date` via `timestampToDate` — already covered by existing test pattern; add shared-vocab variant.
  - Existing `getSharedAnalysisPages` test still passes after removing `importVocabulary`/`importGrammar`.

### U2. Update Firestore rules for shared vocab/grammar collections

- **Goal:** Allow authenticated learners to read shared vocab and grammar collections while denying client writes.
- **Files:** `japanese-alchemy-hosting/firestore.rules`
- **Patterns:** Follow the existing `shared_analysis_pages` rule: `allow read: if isAuthenticated()` with no write/delete rule.
- **Technical design:** Add two match blocks after the existing `shared_analysis_pages` block:
  - `match /shared_vocabularies/{docId} { allow read: if isAuthenticated(); }`
  - `match /shared_grammars/{docId} { allow read: if isAuthenticated(); }`
- **Test scenarios:** `japanese-alchemy-hosting/functions/test/firestore.rules.test.ts` (if a rules test harness exists) or manual verification via `firebase deploy --only firestore:rules`.
  - Authenticated user can read `shared_vocabularies` documents.
  - Unauthenticated user cannot read `shared_vocabularies` documents.
  - Authenticated user cannot write to `shared_vocabularies` (no write rule).
  - Same three checks for `shared_grammars`.
  - Existing `shared_analysis_pages` rules unchanged.
  - Test expectation: none — `firestore.rules` has no existing automated test harness in this repo; verify manually after deploy.

### U3. Merge shared items into Vocabularies and Grammars tabs

- **Goal:** Display shared vocab and grammar alongside personal items with a "Shared" badge and source attribution, and remove the import section from Shared Pages.
- **Files:** `japanese-alchemy-webapp/app/page.tsx`
- **Patterns:** Follow the existing card rendering for vocab and grammar. Use the existing `safeSourceUrl` helper for the source link. Use `parseFurigana` for source text rendering.
- **Technical design:**
  - Add `sharedVocabularies` and `sharedGrammars` state arrays alongside the existing personal arrays.
  - In `loadData`, add `getSharedVocabularies()` and `getSharedGrammars()` to the `Promise.all` array.
  - Vocabularies tab: render `[...vocabularies, ...sharedVocabularies]` mapped with a conditional `isShared`-based badge. Shared cards show `metadata.source_text` via `parseFurigana` and a "Source" link when `safeSourceUrl(metadata.source_url)` is valid. Personal cards retain their existing shape (no badge, no source attribution). Neither card type shows a delete button on vocab (existing behavior — only pages have delete).
  - Grammars tab: render `[...grammars, ...sharedGrammars]` with the same badge and source attribution pattern.
  - Tab counts: `Vocabularies ({vocabularies.length + sharedVocabularies.length})` and `Grammars ({grammars.length + sharedGrammars.length})`.
  - Shared Pages tab: remove the entire `structured_json` conditional block (the "Import items" section with per-item import buttons). Remove `handleImportVocabulary` and `handleImportGrammar` handlers and their `importVocabulary`/`importGrammar` imports.
- **Test scenarios:** Manual verification via `npm run dev` (no existing component test harness for `page.tsx`).
  - Vocabularies tab shows personal items without badge and shared items with "Shared" badge and source attribution.
  - Grammars tab shows personal and shared items with the same distinction.
  - Tab counts reflect merged totals.
  - Shared Pages tab shows analysis content (source text, rendered markdown, date, source link) with no import buttons.
  - Shared item with missing `metadata` shows badge but no source attribution (graceful degradation).
  - Shared item with invalid `source_url` shows source text but no link.

---

## Verification Contract

| Verification | Command | Applicability |
|---|---|---|
| Webapp service tests | `cd japanese-alchemy-webapp && npx vitest run services/firestoreService.test.ts` | U1 |
| Webapp lint | `cd japanese-alchemy-webapp && npm run lint` | U1, U3 |
| Webapp build | `cd japanese-alchemy-webapp && npm run build` | U1, U3 |
| Firestore rules deploy | `cd japanese-alchemy-hosting && firebase deploy --only firestore:rules` | U2 |

---

## Definition of Done

- `getSharedVocabularies` and `getSharedGrammars` exist in `firestoreService.ts`, read from root collections, and pass their tests.
- `Vocabulary` and `Grammar` interfaces include optional `metadata` and `isShared` fields.
- `firestore.rules` has read-only rules for `shared_vocabularies` and `shared_grammars` matching the `shared_analysis_pages` pattern.
- Vocabularies and Grammars tabs render merged personal + shared items with badge and source attribution on shared cards.
- Shared Pages tab no longer has import buttons.
- `importVocabulary` and `importGrammar` functions and their handlers are removed.
- Webapp builds and lints clean.
- No backend or Chrome extension files changed.
