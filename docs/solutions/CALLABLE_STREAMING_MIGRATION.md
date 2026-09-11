---
module: managed-analysis
problem_type: migration
tags: [firebase, callable, streaming]
---

# Callable Streaming Migration

## Compatibility decision

On 2026-08-11, the raw `explainStream` HTTP/SSE route was retired.

Inventory found no supported raw-stream consumer:

- The Chrome extension calls `explainStreamCallable` through the Firebase
  Functions SDK.
- The backend's raw handler, route registration, tests, and historical SSE
  migration document were the remaining in-repository references.
- GitHub code search found no additional caller in `xfalcons/j-buddy`.

The raw route has no compatibility owner or supported contract. New consumers
must use the Firebase callable stream below.

## Current contract

`explainStreamCallable` is an `onCall` function in `us-central1`. Call it with
`httpsCallable(functions, "explainStreamCallable").stream(requestBody)`.

- Chunks yield `{ content: string }` progressively.
- The final response is `{ success: true, allowance }`, or
  `{ success: false, error, allowance }` for a provider failure after
  admission. `allowance` is present when daily enforcement is enabled and has
  the shape `{ limit, remaining, resetAt }`.
- Validation failures and typed daily-allowance denials use normal Firebase
  callable errors. Daily exhaustion carries
  `{ reason: "daily_allowance_exhausted", limit, resetAt }` in the error
  details.
- Development builds connect the Functions client to the Local Emulator Suite;
  production builds use the deployed callable.

The batch `explain` callable remains available for consumers that need a single
completed analysis response.
