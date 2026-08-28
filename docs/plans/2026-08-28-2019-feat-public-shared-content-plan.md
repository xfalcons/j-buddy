---
title: Public Shared Content Without Login - Plan
type: feat
date: 2026-08-28
topic: public-shared-content
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

## Goal Capsule

- **Objective:** Any visitor can browse shared vocabulary, shared grammar, and shared analysis pages on the webapp at `/` without logging in. Authenticated users see the full dashboard with personal collections as before.
- **Product authority:** This plan covers webapp routing/rendering, Firestore security rules for public reads on shared collections, and the unauthenticated data-loading path. Backend save logic and Chrome extension behavior are not active scope.
- **Open blockers:** None.

## Product Contract

### Summary

Make the webapp's `/` route public: unauthenticated visitors see shared vocabulary, grammar, and analysis pages with a sign-in prompt to access personal collections. Authenticated users see the full dashboard as before. Firestore rules on the three shared collections change from authenticated-only reads to public reads.

### Problem Frame

The webapp currently redirects all unauthenticated visitors from `/` to `/auth`, making the entire dashboard — including shared content tabs — unreachable without login. Even if the redirect were removed, the Firestore security rules require `isAuthenticated()` for reads on all three shared collections (`shared_analysis_pages`, `shared_vocabularies`, `shared_grammars`), so an anonymous client would receive permission-denied errors. The shared collections are explicitly designed for public sharing: they are written when logged-out learners save analyses with the shared flag. The content is already public in intent but inaccessible in practice.

### Requirements

**Public access to shared content**

- R1. An unauthenticated visitor navigating to `/` sees shared vocabulary, shared grammar, and shared analysis pages without being redirected to `/auth`.
- R2. The shared content tabs (Vocabularies with shared items, Grammars with shared items, Shared Pages) are populated and browseable without login.
- R3. An unauthenticated visitor sees a sign-in prompt (link or button to `/auth`) inviting them to log in for personal collections.
- R4. An authenticated user sees the full dashboard unchanged — personal tabs, personal data loading, delete actions, and shared content all work as before.

**Conditional data loading**

- R5. When no user is authenticated, only shared collections are loaded (`getSharedVocabularies`, `getSharedGrammars`, `getSharedAnalysisPages`). Personal collection queries are not executed.
- R6. When a user is authenticated, all data loads as before (personal + shared).

**Conditional tab rendering**

- R7. When no user is authenticated, only shared-content tabs are visible. Personal-only tabs (Pages) are hidden, and the Vocabularies/Grammars tabs show only shared items.
- R8. When a user is authenticated, all four tabs are visible with merged personal + shared content as before.

**Firestore rules**

- R9. The Firestore security rules allow public (unauthenticated) reads on the `shared_analysis_pages` collection.
- R10. The Firestore security rules allow public (unauthenticated) reads on the `shared_vocabularies` collection.
- R11. The Firestore security rules allow public (unauthenticated) reads on the `shared_grammars` collection.
- R12. Client writes and deletes on all three shared collections remain denied; only the Admin SDK (Cloud Functions) can write.

### Key Decisions

- KTD1. Use conditional rendering in the existing Dashboard component rather than a separate public route. When unauthenticated, skip personal data loading, hide personal tabs, show shared tabs with a sign-in prompt. When authenticated, render the full dashboard as before. Avoids routing churn and reuses all existing card rendering. (session-settled: user-directed — chosen over separate `/shared` route or full-dashboard-with-tabs-hidden: one route, conditional state)
- KTD2. Change Firestore rules on shared collections from `allow read: if isAuthenticated()` to `allow read: if true`. The shared collections are explicitly designed for public sharing — written by anonymous users with the shared flag — so public reads align with the product intent. Writes and deletes remain Admin SDK only.
- KTD3. No anonymous Firebase auth. The public page reads Firestore directly without any auth session. This avoids creating ephemeral auth users and keeps the read path simple.

### Success Criteria

- An unauthenticated visitor opening `/` sees shared vocabulary items in the Vocabularies tab, shared grammar items in the Grammars tab, and shared analysis pages in the Shared Pages tab — no redirect, no permission errors.
- An unauthenticated visitor sees a sign-in prompt linking to `/auth`.
- An authenticated user sees the full dashboard with all four tabs, personal data, and delete actions unchanged.
- The Firestore rules permit unauthenticated client reads on all three shared collections but deny client writes and deletes.

### Scope Boundaries

- No changes to backend save logic or the Chrome extension — the save flow and shared flag behavior are unchanged.
- No search, filtering, or pagination on shared content.
- No anonymous Firebase auth — public reads are direct Firestore queries without an auth session.
- No changes to personal collection Firestore rules — those remain owner-only.
- No new routes — `/` handles both authenticated and unauthenticated states.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Remove the auth redirect effect (`if (!loading && !user) router.push('/auth')`) and the `if (!user) return null` guard in the Dashboard component. Replace with conditional rendering: when no user, show shared tabs only with a sign-in CTA in the header. When user present, render the full dashboard. The `loading` guard stays — it shows the loading spinner while Firebase Auth resolves. Governs R1, R3, R4, R7, R8. (session-settled: user-directed — conditional rendering in Dashboard, chosen over separate route: one route, conditional state)
- KTD2. Split the data-loading `useEffect` into two paths: when `user` is present, load personal + shared (existing `Promise.all` with 6 calls). When no `user`, load only shared (3 calls: `getSharedVocabularies`, `getSharedGrammars`, `getSharedAnalysisPages`). The effect's dependency array stays `[user]` — it re-runs when auth state resolves. Governs R5, R6.
- KTD3. Change the three shared-collection Firestore rules from `allow read: if isAuthenticated()` to `allow read: if true`. No write or delete rules added. Governs R9, R10, R11, R12.
- KTD4. In the header, conditionally render: when `user` exists, show email + Sign Out button (existing). When no user, show a "Sign In" button linking to `/auth`. The `useRouter` import can be removed since the redirect is gone — but `router.push('/auth')` on `handleSignOut` still uses it, so `useRouter` stays. Governs R3.

### Assumptions

- Firebase client SDK reads on public-rules collections work without any auth session — verified by the Firestore rules semantics (`allow read: if true` permits all reads regardless of auth state).
- The `loading` state from `onAuthStateChanged` resolves quickly enough that the loading spinner is not a poor UX for first-time visitors. If this becomes an issue, a skeleton or cached-state optimization can come later.
- The shared collections are expected to stay small enough that loading all documents without pagination remains performant for public traffic.

---

## Implementation Units

### U1. Update Firestore rules for public reads on shared collections

- **Goal:** Allow unauthenticated Firestore client reads on all three shared collections.
- **Files:** `japanese-alchemy-hosting/firestore.rules`
- **Patterns:** Change each `allow read: if isAuthenticated()` to `allow read: if true` on the three shared-collection match blocks. Leave write/delete rules absent (denied by default).
- **Technical design:** Three match blocks change: `shared_analysis_pages`, `shared_vocabularies`, `shared_grammars`. Each goes from `allow read: if isAuthenticated()` to `allow read: if true`. Comments updated to reflect public reads. No other rules change.
- **Test scenarios:** `japanese-alchemy-hosting/functions/test/firestore.rules.test.ts` (if a rules test harness exists) or manual verification via `firebase deploy --only firestore:rules`.
  - Unauthenticated client can read `shared_vocabularies` documents.
  - Unauthenticated client can read `shared_grammars` documents.
  - Unauthenticated client can read `shared_analysis_pages` documents.
  - Authenticated client can still read all three shared collections.
  - Client cannot write to any shared collection (no write rule).
  - Personal collection rules unchanged — still owner-only.
  - Test expectation: none — `firestore.rules` has no existing automated test harness; verify manually after deploy.

### U2. Conditional data loading and rendering in Dashboard

- **Goal:** Show shared content to unauthenticated visitors at `/`, show full dashboard to authenticated users.
- **Files:** `japanese-alchemy-webapp/app/page.tsx`
- **Patterns:** Follow the existing conditional patterns in the component. The `SharedBadge` and `SharedSourceAttribution` components already handle shared items. The `safeSourceUrl` helper already exists for source links.
- **Technical design:**
  - Remove the auth redirect effect (`if (!loading && !user) router.push('/auth')`).
  - Remove the `if (!user) return null` guard.
  - Split the data-loading `useEffect`: when `user` present, run the existing 6-call `Promise.all`. When no `user`, run a 3-call `Promise.all` with only `getSharedVocabularies`, `getSharedGrammars`, `getSharedAnalysisPages`.
  - Compute `allVocabularies` and `allGrammars` conditionally: when `user` present, merge `[...vocabularies, ...sharedVocabularies]` (existing). When no `user`, use `sharedVocabularies` directly (and same for grammars).
  - Header: when `user` present, show email + ThemeToggle + Sign Out (existing). When no `user`, show ThemeToggle + "Sign In" button linking to `/auth`.
  - Tab list: when `user` present, show all 4 tabs (existing). When no `user`, show 3 tabs — Vocabularies, Grammars, Shared Pages (hide the personal Pages tab). The grid changes from `grid-cols-4` to `grid-cols-3` conditionally.
  - Pages tab `TabsContent`: when no `user`, this `TabsContent` is not rendered (the `TabsTrigger` is hidden, so the content is never shown).
  - The `handleDeleteAnalysisPage` handler stays — it's only reachable when `user` is present (the Pages tab is hidden for unauthenticated visitors).
  - The `handleSignOut` handler stays — only visible when `user` is present.
- **Test scenarios:** Manual verification via `npm run dev` (no existing component test harness for `page.tsx`).
  - Unauthenticated visitor at `/` sees Vocabularies, Grammars, and Shared Pages tabs — no redirect to `/auth`.
  - Vocabularies tab shows shared items with badges and source attribution.
  - Grammars tab shows shared items with badges and source attribution.
  - Shared Pages tab shows shared analysis pages (read-only).
  - Personal Pages tab is not visible to unauthenticated visitors.
  - "Sign In" button in header links to `/auth`.
  - Authenticated user sees all 4 tabs, personal data, delete buttons, Sign Out — unchanged.
  - Loading spinner shows while auth state resolves, then renders the correct view.

---

## Verification Contract

| Verification | Command | Applicability |
|---|---|---|
| Webapp service tests | `cd japanese-alchemy-webapp && npx vitest run services/firestoreService.test.ts` | Regression — no service changes, but confirm no breakage |
| Webapp lint | `cd japanese-alchemy-webapp && npm run lint` | U2 |
| Webapp build | `cd japanese-alchemy-webapp && npm run build` | U2 |
| Firestore rules deploy | `cd japanese-alchemy-hosting && firebase deploy --only firestore:rules` | U1 |

---

## Definition of Done

- Firestore rules allow public reads on `shared_analysis_pages`, `shared_vocabularies`, and `shared_grammars`; writes and deletes still denied.
- Unauthenticated visitor at `/` sees shared vocab, shared grammar, and shared pages — no redirect, no permission errors.
- Unauthenticated visitor sees a "Sign In" button linking to `/auth`.
- Personal Pages tab hidden for unauthenticated visitors; Vocabularies and Grammars tabs show shared items only.
- Authenticated user sees full dashboard with all 4 tabs, personal data, delete actions — unchanged.
- Webapp builds and lints clean (no new errors).
- No backend or Chrome extension files changed.
