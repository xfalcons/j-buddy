import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(),
  Timestamp: { fromDate: (date: Date) => ({ type: "timestamp", value: date }) },
}));

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import * as functions from "firebase-functions";
import { getFirestore } from "firebase-admin/firestore";
import { admitDailyAllowance, httpsErrorForDeniedAllowance } from "../../src/v1/dailyAllowance";
import { createHmac } from "crypto";

function ipKey(key: string) {
  return createHmac("sha256", key).update("203.0.113.10").digest("hex");
}

function firestoreWith(records: Record<string, { count: number }>, throwOnTransaction = false) {
  const writes: Array<{ id: string; data: any }> = [];
  (getFirestore as jest.Mock).mockReturnValue({
    collection: () => ({ doc: (id: string) => ({ id }) }),
    runTransaction: async (work: any) => {
      if (throwOnTransaction) throw new Error("firestore unavailable");
      return work({
        get: async (ref: { id: string }) => ({
          exists: Boolean(records[ref.id]),
          data: () => records[ref.id],
        }),
        set: (ref: { id: string }, data: any) => writes.push({ id: ref.id, data }),
      });
    },
  });
  return writes;
}

describe("admitDailyAllowance", () => {
  const now = new Date("2026-09-09T12:00:00Z");

  beforeEach(() => {
    jest.mocked(getFirestore).mockReset();
    jest.mocked(functions.logger.info).mockReset();
    jest.mocked(functions.logger.warn).mockReset();
    jest.mocked(functions.logger.error).mockReset();
  });

  it("atomically admits against user and pseudonymous IP subjects", async () => {
    const writes = firestoreWith({});
    const result = await admitDailyAllowance({
      uid: "user-1",
      ip: "203.0.113.10",
      activeHmacKey: "active-key",
      now,
      endpoint: "explain",
    });

    expect(result).toEqual({
      allowed: true,
      limit: 20,
      remaining: 19,
      resetAt: "2026-09-10T00:00:00.000Z",
    });
    expect(writes).toHaveLength(2);
    expect(writes.some(({ id }) => id.endsWith("user:user-1"))).toBe(true);
    expect(writes.some(({ id }) => id.includes(":ip:") && !id.includes("203.0.113.10"))).toBe(true);
    expect(writes[0].data.expireAt.value.toISOString()).toBe("2026-09-12T00:00:00.000Z");
  });

  it("starts an independent allowance at the UTC-day boundary", async () => {
    const writes = firestoreWith({ "2026-09-09:user:user-1": { count: 20 } });

    const beforeMidnight = await admitDailyAllowance({
      uid: "user-1",
      now: new Date("2026-09-09T23:59:59.999Z"),
    });
    const afterMidnight = await admitDailyAllowance({
      uid: "user-1",
      now: new Date("2026-09-10T00:00:00.000Z"),
    });

    expect(beforeMidnight).toMatchObject({ allowed: false, reason: "daily_allowance_exhausted" });
    expect(afterMidnight).toEqual({
      allowed: true,
      limit: 20,
      remaining: 19,
      resetAt: "2026-09-11T00:00:00.000Z",
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].id).toBe("2026-09-10:user:user-1");
  });

  it("logs one decision when Firestore retries the transaction", async () => {
    let attempts = 0;
    (getFirestore as jest.Mock).mockReturnValue({
      collection: () => ({ doc: (id: string) => ({ id }) }),
      runTransaction: async (work: any) => {
        attempts += 1;
        const transaction = {
          get: async () => ({ exists: false, data: () => undefined }),
          set: () => undefined,
        };
        if (attempts === 1) {
          await work(transaction);
          attempts += 1;
        }
        return work(transaction);
      },
    });

    const result = await admitDailyAllowance({
      uid: "user-1",
      activeHmacKey: "key",
      now,
      endpoint: "explain",
    });

    expect(attempts).toBe(2);
    expect(result).toMatchObject({ allowed: true });
    expect(functions.logger.info).toHaveBeenCalledTimes(1);
    expect(functions.logger.info).toHaveBeenCalledWith("Daily allowance decision", {
      endpoint: "explain",
      outcome: "admitted",
      subjectTypes: ["user"],
    });
  });

  it("denies without writes when either subject is exhausted", async () => {
    const writes = firestoreWith({ "2026-09-09:user:user-1": { count: 20 } });
    const result = await admitDailyAllowance({
      uid: "user-1",
      ip: "203.0.113.10",
      activeHmacKey: "active-key",
      now,
    });

    expect(result).toEqual({
      allowed: false,
      reason: "daily_allowance_exhausted",
      limit: 20,
      resetAt: "2026-09-10T00:00:00.000Z",
    });
    expect(writes).toHaveLength(0);
  });

  it("counts the previous IP key during rotation and writes only the active key", async () => {
    const activeDocumentId = `2026-09-09:ip:${ipKey("active-key")}`;
    const previousDocumentId = `2026-09-09:ip:${ipKey("previous")}`;
    const writes = firestoreWith({
      "2026-09-09:user:user-1": { count: 3 },
      [previousDocumentId]: { count: 10 },
      [activeDocumentId]: { count: 4 },
    });

    const result = await admitDailyAllowance({
      uid: "user-1",
      ip: "203.0.113.10",
      activeHmacKey: "active-key",
      previousHmacKey: "previous",
      now,
    });

    expect(result).toMatchObject({ allowed: true, remaining: 9 });
    expect(writes).toHaveLength(2);
    const ipWrite = writes.find(({ id }) => id.includes(":ip:"));
    expect(ipWrite?.data.count).toBe(11);
  });

  it("does not grant a fresh IP allowance immediately after key rotation", async () => {
    const writes = firestoreWith({
      [`2026-09-09:ip:${ipKey("previous")}`]: { count: 20 },
    });
    const result = await admitDailyAllowance({
      ip: "203.0.113.10",
      activeHmacKey: "active-key",
      previousHmacKey: "previous",
      now,
    });

    expect(result).toMatchObject({ allowed: false, reason: "daily_allowance_exhausted" });
    expect(writes).toHaveLength(0);
  });

  it("admits a signed-in request with no IP against its user subject", async () => {
    const writes = firestoreWith({});
    const result = await admitDailyAllowance({ uid: "user-1", activeHmacKey: "key", now });
    expect(result).toMatchObject({ allowed: true, remaining: 19 });
    expect(writes).toHaveLength(1);
  });

  it("rejects an anonymous request with no client IP", async () => {
    const writes = firestoreWith({});
    const result = await admitDailyAllowance({ now });
    expect(result).toEqual({ allowed: false, reason: "missing_ip" });
    expect(writes).toHaveLength(0);
  });

  it("fails closed without exposing allowance data on a datastore error", async () => {
    firestoreWith({}, true);
    const result = await admitDailyAllowance({
      ip: "203.0.113.10",
      activeHmacKey: "key",
      now,
      endpoint: "explainStreamCallable",
    });
    expect(result).toEqual({ allowed: false, reason: "unavailable" });
    expect(httpsErrorForDeniedAllowance({ allowed: false, reason: "unavailable" }).details).toEqual({
      reason: "unavailable",
    });
    expect(functions.logger.error).toHaveBeenCalledWith("Daily allowance decision", {
      endpoint: "explainStreamCallable",
      outcome: "datastore-unavailable",
      subjectTypes: ["ip"],
    });
  });
});
