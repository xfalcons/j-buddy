import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.mock("firebase-admin/firestore", () => ({ getFirestore: jest.fn() }));

import { getFirestore } from "firebase-admin/firestore";
import {
  checkRateLimit,
  rateLimitKey,
  RATE_LIMIT_CAPACITY,
} from "../../src/v1/rateLimiter";

// Build a mock Firestore whose transaction surfaces a given stored doc state.
function configureTx(
  docData: { tokens?: number; updatedAt?: number } | null,
  opts: { throwOnTx?: boolean } = {}
) {
  const setFn = jest.fn();
  const txGet = jest.fn(async () => ({
    exists: docData !== null,
    data: () => docData ?? {},
  }));
  const runTransaction = jest.fn(async (cb: any) => {
    if (opts.throwOnTx) throw new Error("firestore down");
    return cb({ get: txGet, set: setFn });
  });
  (getFirestore as jest.Mock).mockReturnValue({
    collection: () => ({ doc: () => ({}) }),
    runTransaction,
  });
  return { setFn, runTransaction };
}

describe("rateLimitKey", () => {
  it("is deterministic for the same IP", () => {
    expect(rateLimitKey("1.2.3.4")).toBe(rateLimitKey("1.2.3.4"));
  });

  it("differs across IPs", () => {
    expect(rateLimitKey("1.2.3.4")).not.toBe(rateLimitKey("5.6.7.8"));
  });

  it("is not the raw IP and is HMAC-SHA256 hex-shaped", () => {
    const key = rateLimitKey("1.2.3.4");
    expect(key).not.toBe("1.2.3.4");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => {
    (getFirestore as jest.Mock).mockReset();
  });

  it("allows when the bucket is full (new IP)", async () => {
    configureTx(null);
    const d = await checkRateLimit("1.2.3.4");
    expect(d.allowed).toBe(true);
  });

  it("denies when the bucket is empty and writes nothing", async () => {
    const { setFn } = configureTx({ tokens: 0, updatedAt: Date.now() });
    const d = await checkRateLimit("1.2.3.4");
    expect(d.allowed).toBe(false);
    expect(setFn).not.toHaveBeenCalled();
  });

  it("refills tokens after time elapses", async () => {
    configureTx({ tokens: 0, updatedAt: 0 }); // far in the past -> refilled to capacity
    const d = await checkRateLimit("1.2.3.4");
    expect(d.allowed).toBe(true);
  });

  it("decrements the bucket on an allowed request", async () => {
    const { setFn } = configureTx(null);
    await checkRateLimit("1.2.3.4");
    expect(setFn).toHaveBeenCalledTimes(1);
    const [, data] = setFn.mock.calls[0] as any[];
    expect(data.tokens).toBe(RATE_LIMIT_CAPACITY - 1);
  });

  it("fails open (allows) when the client IP is missing", async () => {
    const { setFn } = configureTx(null);
    const d = await checkRateLimit(undefined);
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe("no-ip");
    expect(setFn).not.toHaveBeenCalled();
  });

  it("fails closed (denies) on a Firestore error", async () => {
    configureTx(null, { throwOnTx: true });
    const d = await checkRateLimit("1.2.3.4");
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("limiter-error");
  });
});
