import { describe, it, expect } from "@jest/globals";
import {
  explainRuntimeOptions,
  MAX_CONCURRENT_STREAMS,
} from "../src/runtimeOptions";

describe("explainRuntimeOptions", () => {
  it("sets a bounded maxInstances cost ceiling", () => {
    expect(explainRuntimeOptions.maxInstances).toBeGreaterThan(0);
    // Low-traffic extension: keep the concurrent-stream ceiling small.
    expect(explainRuntimeOptions.maxInstances).toBeLessThanOrEqual(50);
  });

  it("uses concurrency 1 so maxInstances is a literal concurrent-stream cap", () => {
    expect(explainRuntimeOptions.concurrency).toBe(1);
  });

  it("caps per-request stream duration at <= 60s", () => {
    expect(explainRuntimeOptions.timeoutSeconds).toBeLessThanOrEqual(60);
  });

  it("does not pin warm instances (no idle cost on an abuse-prone surface)", () => {
    expect(explainRuntimeOptions.minInstances ?? 0).toBe(0);
  });

  it("exposes the worst-case concurrent-stream ceiling (maxInstances, since concurrency is 1)", () => {
    expect(MAX_CONCURRENT_STREAMS).toBe(10);
  });
});
