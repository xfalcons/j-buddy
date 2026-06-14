"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_CONCURRENT_STREAMS = exports.explainRuntimeOptions = void 0;
/**
 * Cost-ceiling runtime options shared by the LLM-backed explain endpoints.
 *
 * These convert an unbounded denial-of-wallet surface into a bounded cost
 * ceiling. The true concurrent-stream ceiling is `maxInstances × concurrency`:
 * each SSE request occupies a concurrency slot for the whole stream, so with
 * `concurrency: 1`, `maxInstances` is a literal concurrent-stream cap (10 here).
 *
 * Tuned for a low-traffic extension. Raise `maxInstances` if legitimate
 * concurrency demands it; the product `maxInstances × concurrency` is the
 * worst-case concurrent-spend window, each stream running up to `timeoutSeconds`.
 * `minInstances` is deliberately unset (no idle cost on an abuse-prone surface).
 */
exports.explainRuntimeOptions = {
    maxInstances: 10,
    concurrency: 1,
    memory: "512MiB",
    cpu: 1,
    timeoutSeconds: 60,
};
/** Worst-case concurrent LLM streams = maxInstances × concurrency. */
exports.MAX_CONCURRENT_STREAMS = exports.explainRuntimeOptions.maxInstances *
    exports.explainRuntimeOptions.concurrency;
//# sourceMappingURL=runtimeOptions.js.map