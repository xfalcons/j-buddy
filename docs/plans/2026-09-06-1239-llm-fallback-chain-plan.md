---
title: Sequential LLM Fallback Chain
date: 2026-09-06
type: plan
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

## Goal Capsule

**Objective:** Add a static, ordered LLM provider fallback chain so that when the active provider returns a 429 (rate limit) or 5xx (server error), the request automatically retries with the next provider in the chain before failing.

**Means:** A new `LlmServiceChain` wrapper class that iterates through `["gemini", "zai"]` on retryable errors, integrated via the existing `createLlmService()` factory. No handler changes; telemetry stays unchanged; only logging captures the chain.

**Stop when:** All three implementation units pass verification (compile, tests, smoke test) and the plan's Definition of Done is met.

---

## Product Contract

### Problem Frame

J-Buddy's Firebase Functions currently use a single hardcoded LLM provider (`gemini`). When that provider returns a 429 (rate limit exceeded) or 5xx (server error), the entire request fails with no recovery path. Both the batch `explain()` callable and the streaming `explainStreamCallable()` callable are affected. The two providers (Gemini and ZAI) use the same OpenAI-compatible `/chat/completions` protocol, making a transparent retry wrapper structurally safe.

### Requirements

**Single-Provider Retry**
- R1. When `chatCompletion()` or `streamCompletion()` receives a 429 or 5xx from the current provider, retry with the next provider in the configured chain.
- R2. Non-retryable errors (400 Bad Request, 401/403 Unauthorized, 404 Not Found, input validation failures) must propagate immediately without consuming the next provider.
- R3. If all providers in the chain fail with retryable errors, throw the last provider's error (not a generic "all failed" message).

**Retry Classification**
- R4. Retryable errors are: Firebase `HttpsError` with status 429 or status 500-599; generic `Error` with network-related messages (ECONNRESET, ETIMEDOUT, ECONNREFUSED, ENOTFOUND, "fetch failed").
- R5. Non-retryable errors are: Firebase `HttpsError` with status 400, 401, 403, 404, or any status outside 429/5xx; any other `Error` not matching the network pattern.

**Streaming Behavior**
- R6. For `streamCompletion()`, retry is attempted only on fetch-level failures (connection refused, 429, 5xx returned before the stream starts). Once `fetch()` resolves with a 200 Response, the stream is considered live.
- R7. Mid-stream failures (drop during data consumption) are not retried; the error propagates to the client as-is.

**Configuration**
- R8. The provider chain order is a static constant in `config.ts`: `["gemini", "zai"]`. Changing the order requires a deploy.
- R9. The config secret (`JAPANESE_ALCHEMY_CONFIG`) format is unchanged — it still carries `gemini` and `zai` provider configs. The chain reads providers via the existing `createLlmService(name)` path.

**Observability**
- R10. Each provider attempt (success or failure) is logged via `functions.logger` with the provider name and status. On fallback success, log which provider ultimately served the request.
- R11. The existing `logLlmUsageTelemetry()` call in handlers is unchanged — it logs the first provider attempted. No new response fields are added.

**Compatibility**
- R12. `createLlmService("gemini")` or `createLlmService("zai")` with an explicit provider continues to return that single provider (no retry chain).
- R13. `createLlmService()` with no argument returns the `LlmServiceChain` (uses the full chain).

### Key Decisions

- **Static chain in code, not secret** — Chain order is a constant (`["gemini", "zai"]`) in `config.ts`. Changing it requires a deploy. This avoids config parsing complexity in cold-start functions and keeps the secret schema unchanged. `(session-settled: user-directed — chosen over dynamic secret config: simpler cold-start, no config schema migration)`
- **Batch + streaming fallback** — Both `chatCompletion` and `streamCompletion` use the same retry-on-429-or-5xx logic. `(session-settled: user-directed — chosen over batch-only: coverage parity, the service interface is shared)`
- **Streaming: fetch-level only** — Mid-stream drops are not retried. `(session-settled: user-directed — chosen over stream-replay: avoids connection replay complexity; client sees the failure)`
- **Only 429 and 5xx are retryable** — 400, 401, 403, and other errors propagate immediately. `(session-settled: user-directed — chosen over broader retry: retrying on 400/401/403 wastes the next provider's quota)`
- **Logging only, no telemetry changes** — Provider chain attempts are logged; the existing `logLlmUsageTelemetry()` stays unchanged. `(session-settled: user-approved — telemetry can be enhanced in a follow-up if needed)`

### Scope Boundaries

- Out of scope: Adding new providers beyond the current two. The chain is `["gemini", "zai"]`; adding providers requires a deploy to update the constant.
- Out of scope: Config secret format changes. Both providers' credentials remain in the existing `JAPANESE_ALCHEMY_CONFIG` JSON secret.
- Out of scope: Streaming mid-stream replay. If a stream drops after it has started, the error propagates to the client.

---

## Planning Contract

### Key Technical Decisions

- **KTD1. `LlmServiceChain` as a wrapper class.** A new class implementing `LlmService` that holds an array of `LlmService` instances (one per chain member) and iterates them on retryable errors. Not a higher-order function — a class keeps the pattern consistent with existing service classes and makes it easy to extend (e.g., add circuit-breaking later).
  - **Rationale:** The existing `GeminiLlmService` and `ZaiLlmService` are classes. A wrapper class follows the same pattern, and the factory can return either a single provider or the chain without changing the `LlmService` interface contract.
  - **Alternative:** A higher-order function that wraps a single `LlmService`. Rejected because it would require handlers to change their call sites to compose the wrapper explicitly.

- **KTD2. `NetworkError` sentinel for fetch network failures.** `fetch()` rejects with `TypeError` (or a plain `Error`) on network failures. A `NetworkError` wrapper class (simple `extends Error`) normalizes these so `shouldRetry()` can match reliably.
  - **Rationale:** `fetch()` rejection types vary by environment (Node.js `UND_ERR_SOCKET`, browser `TypeError`). Wrapping ensures consistent matching.
  - **Alternative:** String-matching on `error.message`. Rejected because error messages are implementation-dependent and fragile; a `NetworkError` class is explicit.

- **KTD3. Factory return type change.** `createLlmService()` without arguments returns `LlmServiceChain`. With an explicit `ai` argument, it returns the single provider.
  - **Rationale:** This is a non-breaking change — all existing calls with explicit `"gemini"` continue to work. Calls without an argument (none currently exist in the codebase) will now get the chain, which is the desired default.
  - **Alternative:** A separate `createRetryableLlmService()` function. Rejected because it would require handler changes; the factory is the established entry point.

### Assumptions

- Both Gemini and ZAI use the OpenAI-compatible `/chat/completions` protocol (verified in code). The retry wrapper does not need provider-specific logic.
- Gemini's `thinking_config` extra body is handled per-provider, not in the chain. Each individual service appends its own provider-specific config.
- Firebase Functions `HttpsError` instances are caught via `instanceof HttpsError` check. The `status` property maps to HTTP status codes (429, 500, etc.).
- The rate limiter (`checkRateLimit`) runs before the LLM call and is unaffected by this change. Rate limiting at the Firebase Functions level is orthogonal to LLM provider rate limiting.

---

## Implementation Units

### U1. Add `LLM_CHAIN` constant and type to config

- **Goal:** Define the provider chain order and a TypeScript type alias in `config.ts`.
- **Files:** `japanese-alchemy-hosting/functions/src/config.ts`
- **Changes:**
  - Add `export const LLM_CHAIN = ["gemini", "zai"] as const;`
  - Add `export type LlmChain = readonly string[];` (type alias for the constant)
- **Patterns to follow:** Existing `LLM_PROVIDER` constant pattern. Use `as const` for type safety.
- **Test expectation:** none — pure config constant.

### U2. Create `llmRetryService.ts` with `LlmServiceChain` and `shouldRetry()`

- **Goal:** Implement the retry wrapper class and error classification utility.
- **Files:** `japanese-alchemy-hosting/functions/src/services/llmRetryService.ts` (new)
- **Design:**
  - `shouldRetry(error: unknown): boolean` — checks if an error is retryable per R4/R5
    - Firebase `HttpsError` with status 429 → `true`
    - Firebase `HttpsError` with status 500-599 → `true`
    - Generic `Error` with network-related message → `true`
    - Everything else → `false`
  - `LlmServiceChain` class implementing `LlmService`:
    - Constructor: builds an array of `LlmService` instances by calling `createLlmService(name)` for each name in `LLM_CHAIN`
    - `chatCompletion(systemPrompt, content)`: iterates providers, catches retryable errors, retries with next provider. Throws the last error if all fail.
    - `streamCompletion(systemPrompt, content)`: same pattern — catches errors at the fetch level before the Response is returned.
  - Logging: `functions.logger.info` on successful provider; `functions.logger.warn` on each failed attempt with provider name and error message.
- **Patterns to follow:** Match existing service class structure (`GeminiLlmService` / `ZaiLlmService`). Use `functions.logger`, not `console.log`.
- **Test Scenarios:**
  - **T1. Happy path (first provider succeeds):** `chatCompletion()` calls first provider, receives 200, returns response. Logs success with first provider name.
  - **T2. Fallback on 429:** First provider returns `HttpsError(429)`. Chain catches it, logs warning, calls second provider, second succeeds. Returns second provider's response. Logs which provider served it.
  - **T3. Fallback on 5xx:** First provider returns `HttpsError(500)`. Chain retries with second provider, second succeeds. Same logging as T2.
  - **T4. Non-retryable error propagates:** First provider returns `HttpsError(400)`. Chain does NOT retry — throws immediately. Second provider is never called.
  - **T5. All providers fail (retryable):** First provider 429 → retry second → second 429 → throws last error.
  - **T6. Network error triggers retry:** First provider `fetch` throws network error (simulated). Chain retries with second provider.
  - **T7. Streaming — fetch-level retry:** First provider's `fetch()` throws 429. Chain retries `fetch` with second provider. Second provider's Response is returned.
  - **T8. Streaming — 200 Response returned, no retry after:** First provider's `fetch()` returns 200 Response. The Response object is returned immediately. (Mid-stream drop is not tested here — that's an integration concern.)
- **Verification:** Run `npm test` in the functions directory. All new tests in `llmRetryService.test.ts` pass.

### U3. Wire chain into factory and add tests

- **Goal:** Update `createLlmService()` to return the chain by default. Add a test file.
- **Files:** `japanese-alchemy-hosting/functions/src/services/llmService.ts`
- **Changes:**
  - Import `LlmServiceChain` from `./llmRetryService`
  - Import `LLM_CHAIN` from `../config`
  - Modify `createLlmService()`:
    ```
    if (ai is provided) → return single provider (existing behavior)
    else → return new LlmServiceChain()
    ```
- **Patterns to follow:** Existing factory pattern. Keep the existing `switch` for single-provider dispatch.
- **Test Scenarios:**
  - **T9. `createLlmService()` returns `LlmServiceChain`** — no argument → chain instance
  - **T10. `createLlmService("gemini")` returns single provider** — explicit arg → `GeminiLlmService`
  - **T11. `createLlmService("zai")` returns single provider** — explicit arg → `ZaiLlmService`
- **Verification:** Run `npm test`. Existing tests still pass (no behavior change for explicit-provider calls).

---

## Verification Contract

| Command | Applicability | Done Signal |
|---|---|---|
| `cd japanese-alchemy-hosting/functions && npm run build` | All units | TypeScript compiles with zero errors |
| `cd japanese-alchemy-hosting/functions && npm test` | All units | All tests pass, including new `llmRetryService.test.ts` |
| `cd japanese-alchemy-hosting/functions && npm run lint` | All units | ESLint passes with zero warnings |
| Manual: trigger `explain()` with a configured provider that returns 429 | U2, U3 | Request succeeds via fallback provider; logs show the chain |

---

## Definition of Done

**Global:**
- TypeScript compiles with zero errors (Node.js 22 runtime)
- ESLint passes with zero warnings
- All existing tests continue to pass (no regression)
- All new test scenarios listed in U2 (T1-T8) and U3 (T9-T11) are implemented and passing
- No handler code changes required (U1-U3 cover all integration points)

**Per-unit:**
- U1: `LLM_CHAIN` constant exported, type alias available, no behavioral change
- U2: `LlmServiceChain` implements `LlmService` interface, all 8 test scenarios pass, error classification matches R4/R5 exactly
- U3: Factory returns chain by default, single-provider calls unchanged, all 3 test scenarios pass
