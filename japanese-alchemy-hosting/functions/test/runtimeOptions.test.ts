import { describe, it, expect } from "@jest/globals";
import { explainRuntimeOptions } from "../src/runtimeOptions";

describe("explainRuntimeOptions", () => {
  it("sets a bounded maxInstances cost ceiling", () => {
    expect(explainRuntimeOptions.maxInstances).toBeGreaterThan(0);
    // Low-traffic extension: keep the concurrent-stream ceiling small.
    expect(explainRuntimeOptions.maxInstances).toBeLessThanOrEqual(50);
  });

  it("uses concurrency 1 so maxInstances is a literal concurrent-stream cap", () => {
    expect(explainRuntimeOptions.concurrency).toBe(1);
  });

  it("caps per-request duration for the batch callable at <= 60s", () => {
    // explainStream overrides this to 120 in index.ts (SSE streams run longer).
    expect(explainRuntimeOptions.timeoutSeconds).toBeLessThanOrEqual(60);
  });

  it("does not pin warm instances (no idle cost on an abuse-prone surface)", () => {
    expect(explainRuntimeOptions.minInstances ?? 0).toBe(0);
  });
});
