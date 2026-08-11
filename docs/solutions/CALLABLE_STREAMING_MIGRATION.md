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
- The final response is `{ success: true }`, or `{ success: false, error }` for
  a provider failure.
- Validation and rate-limit failures use normal Firebase callable errors.
- Development builds connect the Functions client to the Local Emulator Suite;
  production builds use the deployed callable.

The batch `explain` callable remains available for consumers that need a single
completed analysis response.
