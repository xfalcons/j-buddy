import { createHmac } from "crypto";
import * as functions from "firebase-functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

export const DAILY_ALLOWANCE_LIMIT = 20;
const RETENTION_MS = 48 * 60 * 60 * 1000;

export type AllowanceReason =
  | "daily_allowance_exhausted"
  | "missing_ip"
  | "unavailable";

export interface AllowanceStatus {
  limit: number;
  remaining: number;
  resetAt: string;
}

export type AllowanceDecision =
  | ({ allowed: true } & AllowanceStatus)
  | { allowed: false; reason: "daily_allowance_exhausted"; limit: number; resetAt: string }
  | { allowed: false; reason: "missing_ip" | "unavailable" };

export interface AllowanceRequest {
  uid?: string;
  ip?: string;
  activeHmacKey?: string;
  previousHmacKey?: string;
  now?: Date;
  endpoint?: string;
}

interface SubjectPlan {
  type: "user" | "ip";
  documentIds: string[];
  writeDocumentId: string;
}

function dayWindow(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const reset = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { day: start.toISOString().slice(0, 10), reset };
}

function ipSubject(ip: string, key: string) {
  return `ip:${createHmac("sha256", key).update(ip).digest("hex")}`;
}

function subjectsFor(day: string, request: AllowanceRequest): SubjectPlan[] {
  const subjects: SubjectPlan[] = [];
  if (request.uid) {
    const id = `${day}:user:${request.uid}`;
    subjects.push({ type: "user", documentIds: [id], writeDocumentId: id });
  }
  if (request.ip && request.activeHmacKey) {
    const active = ipSubject(request.ip, request.activeHmacKey);
    const documentIds = [`${day}:${active}`];
    if (request.previousHmacKey) {
      documentIds.push(`${day}:${ipSubject(request.ip, request.previousHmacKey)}`);
    }
    subjects.push({ type: "ip", documentIds, writeDocumentId: `${day}:${active}` });
  }
  return subjects;
}

function logDecision(endpoint: string | undefined, outcome: string, types: string[]) {
  functions.logger.info("Daily allowance decision", {
    endpoint,
    outcome,
    subjectTypes: types,
  });
}

export function httpsErrorForDeniedAllowance(
  decision: Exclude<AllowanceDecision, { allowed: true }>
) {
  if (decision.reason === "daily_allowance_exhausted") {
    return {
      code: "resource-exhausted" as const,
      message: "Daily analysis allowance exhausted",
      details: { reason: decision.reason, limit: decision.limit, resetAt: decision.resetAt },
    };
  }
  if (decision.reason === "missing_ip") {
    return {
      code: "failed-precondition" as const,
      message: "Client identity is unavailable",
      details: { reason: decision.reason },
    };
  }
  return {
    code: "unavailable" as const,
    message: "Allowance service temporarily unavailable",
    details: { reason: decision.reason },
  };
}

/** Atomically consumes the daily allowance for every applicable subject. */
export async function admitDailyAllowance(
  request: AllowanceRequest
): Promise<AllowanceDecision> {
  const now = request.now ?? new Date();
  const { day, reset } = dayWindow(now);
  if (!request.ip && !request.uid) {
    logDecision(request.endpoint, "missing-ip", []);
    return { allowed: false, reason: "missing_ip" };
  }

  const subjects = subjectsFor(day, request);
  try {
    const decision = await getFirestore().runTransaction(async (transaction) => {
      const documents = new Map<string, number>();
      for (const subject of subjects) {
        for (const documentId of subject.documentIds) {
          if (documents.has(documentId)) continue;
          const snapshot = await transaction.get(
            getFirestore().collection("dailyAllowances").doc(documentId)
          );
          documents.set(documentId, snapshot.exists ? Number(snapshot.data()?.count ?? 0) : 0);
        }
      }

      const effectiveCounts = subjects.map((subject) =>
        Math.max(...subject.documentIds.map((documentId) => documents.get(documentId) ?? 0))
      );
      const effectiveCount = Math.max(...effectiveCounts);
      const remaining = Math.max(0, DAILY_ALLOWANCE_LIMIT - effectiveCount);
      if (remaining === 0) {
        return {
          allowed: false as const,
          reason: "daily_allowance_exhausted" as const,
          limit: DAILY_ALLOWANCE_LIMIT,
          resetAt: reset.toISOString(),
        };
      }

      subjects.forEach((subject, index) => {
        transaction.set(
          getFirestore().collection("dailyAllowances").doc(subject.writeDocumentId),
          {
            count: effectiveCounts[index] + 1,
            expireAt: Timestamp.fromDate(new Date(reset.getTime() + RETENTION_MS)),
          }
        );
      });
      return {
        allowed: true as const,
        limit: DAILY_ALLOWANCE_LIMIT,
        remaining: remaining - 1,
        resetAt: reset.toISOString(),
      };
    });
    logDecision(
      request.endpoint,
      decision.allowed ? "admitted" : "exhausted",
      subjects.map(({ type }) => type)
    );
    return decision;
  } catch {
    functions.logger.error("Daily allowance decision", {
      endpoint: request.endpoint,
      outcome: "datastore-unavailable",
      subjectTypes: subjects.map(({ type }) => type),
    });
    return { allowed: false, reason: "unavailable" };
  }
}
