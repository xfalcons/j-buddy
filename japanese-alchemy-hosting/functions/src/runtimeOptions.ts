import type { GlobalOptions } from "firebase-functions/v2/options";

/**
 * Cost-ceiling runtime options shared by the LLM-backed explain endpoints.
 *
 * These convert an unbounded denial-of-wallet surface into a bounded cost
 * ceiling. The true concurrent-stream ceiling is `maxInstances × concurrency`:
 * each streaming callable occupies a concurrency slot for the whole stream, so with
 * `concurrency: 1`, `maxInstances` is a literal concurrent-stream cap (10 here).
 *
 * Tuned for a low-traffic extension. Raise `maxInstances` if legitimate
 * concurrency demands it; the product `maxInstances × concurrency` is the
 * worst-case concurrent-spend window. `timeoutSeconds` is set per function
 * (explainStreamCallable streams longer than explain) — see index.ts. `minInstances` is
 * deliberately unset (no idle cost on an abuse-prone surface).
 */
export const explainRuntimeOptions: GlobalOptions = {
  maxInstances: 10,
  concurrency: 1,
  memory: "512MiB",
  cpu: 1,
  timeoutSeconds: 60,
};
