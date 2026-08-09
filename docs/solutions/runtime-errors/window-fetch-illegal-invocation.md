---
title: Window.fetch receiver binding in personal provider requests
date: 2026-08-09
category: runtime-errors
module: chrome-extension-direct-llm-api-service
problem_type: runtime_error
component: assistant
symptoms:
  - "Personal provider analysis fails with TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation."
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags: [chrome-extension, window-fetch, direct-llm, personal-provider, receiver-binding]
---

# Window.fetch receiver binding in personal provider requests

## Problem

Before the fix, personal-provider analysis failed before the configured provider could respond. The direct-provider transport stored the browser's native `Window.fetch` function and later invoked it as a service method.

## Symptoms

The Chrome side panel reported:

```text
TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation
```

`DirectLlmApiService.request()` catches non-abort request exceptions and maps them to a generic personal-provider network error, which initially made this look like an endpoint, permission, or network problem. The catch path is in [directLlmApiService.js](../../../japanese-alchemy-chrome-extension/src/scripts/directLlmApiService.js#L196-L219).

## What Didn't Work

- Checking the Gemini endpoint and extension host access could not fix this failure because the browser threw before any request reached the provider.
- Ordinary Jest fetch mocks did not reveal the bug because they accepted any `this` receiver.

## Solution

Wrap the supplied transport and explicitly invoke it with the extension global object.

Before:

```js
this.fetch = fetchImpl;
```

After:

```js
this.fetch = (...args) => fetchImpl.call(globalThis, ...args);
```

The wrapper in [directLlmApiService.js](../../../japanese-alchemy-chrome-extension/src/scripts/directLlmApiService.js#L187-L193) preserves the `Window` receiver when `request()` calls `this.fetch(url, options)`.

## Why This Works

Calling a function through `this.fetch(...)` sets `this` inside that function to the `DirectLlmApiService` instance. Chromium's native `Window.fetch` requires the extension global as its receiver, so it rejected the detached call. Calling the captured function with `globalThis` satisfies that requirement without changing the request URL, headers, payload, streaming behavior, or error-redaction flow.

## Prevention

Keep a receiver-sensitive test when a browser-native method is stored or injected as a callback. [directLlmApiService.test.js](../../../japanese-alchemy-chrome-extension/tests/directLlmApiService.test.js#L62-L80) uses a fetch stub that throws unless `this === globalThis`, then verifies the analysis completes without `onError`.

```js
const fetch = jest.fn(function receiverSensitiveFetch() {
  if (this !== globalThis) {
    throw new TypeError('fetch requires the extension global receiver');
  }
  return jsonResponse({
    choices: [{ message: { content: 'bound response' }, finish_reason: 'stop' }],
  });
});
```

## Related Issues

- Personal-provider support was introduced on [PR #10](https://github.com/xfalcons/j-buddy/pull/10), which is open at the time of writing.
- [SSE Streaming Migration](../SSE_STREAMING_MIGRATION.md) covers the managed Firebase streaming path; it shares the broader fetch/SSE domain but not this receiver-binding failure.
