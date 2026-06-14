import { createHmac } from "crypto";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "../utils/logger";

// Token-bucket config per client IP. Tuned for a low-traffic extension; raise
// if legitimate usage needs more headroom. RATE_LIMIT_CAPACITY is kept at or
// below the deployment's concurrent-stream ceiling (maxInstances x concurrency)
// so a single source cannot admit more concurrent requests than the whole
// deployment can serve.
export const RATE_LIMIT_CAPACITY = 8;
export const RATE_LIMIT_REFILL_PER_MIN = 20;
const RATE_LIMIT_COLLECTION = "rateLimits";
const REFILL_INTERVAL_MS = (60 * 1000) / RATE_LIMIT_REFILL_PER_MIN;
// Documents older than this are eligible for Firestore TTL-policy deletion.
export const RATE_LIMIT_DOC_TTL_MS = 60 * 60 * 1000; // 1 hour

// Server-side HMAC key. This defends only against the anonymous attacker, who
// cannot read deployed source — so while the repo is private and the deployed
// source does not leak, the identifier is not trivially reversible over the IPv4
// space. If the source becomes public, rotate the salt (and the collection name
// together) or move the key into Secret Manager.
const IP_HMAC_KEY = "j-buddy-ratelimit-ip-key-v1";

/** Deterministic, non-reversible-at-rest identifier for a client IP. */
export function rateLimitKey(ip: string): string {
  return createHmac("sha256", IP_HMAC_KEY).update(ip).digest("hex");
}

export interface RateLimitDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Check the per-client token bucket. A single Firestore document per (HMAC'd)
 * IP, mutated inside a transaction so concurrent requests serialize correctly.
 * Proportionate for low traffic: contention only affects an abusive IP's own
 * bucket. Sharding is the scale-up path if a single hot document binds.
 *
 * Failure posture:
 *  - Missing/unparseable client IP: fail open (allow) — availability for
 *    legitimate unusual proxies. Logged.
 *  - Firestore error: fail closed (deny) — this layer protects LLM spend, not
 *    availability. Logged at error level (alertable).
 */
export async function checkRateLimit(
  ip: string | undefined
): Promise<RateLimitDecision> {
  if (!ip) {
    logger.warn("Rate limit: missing client IP — allowing (fail-open)");
    return { allowed: true, reason: "no-ip" };
  }

  const ref = getFirestore().collection(RATE_LIMIT_COLLECTION).doc(rateLimitKey(ip));

  try {
    const allowed = await getFirestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      let tokens = RATE_LIMIT_CAPACITY;
      if (snap.exists) {
        const data = snap.data() as { tokens?: number; updatedAt?: number };
        const updatedAt = data.updatedAt ?? now;
        const elapsed = now - updatedAt;
        tokens = Math.min(
          RATE_LIMIT_CAPACITY,
          (data.tokens ?? 0) + elapsed / REFILL_INTERVAL_MS
        );
      }
      if (tokens >= 1) {
        tx.set(ref, {
          tokens: tokens - 1,
          updatedAt: now,
          expireAt: now + RATE_LIMIT_DOC_TTL_MS,
        });
        return true;
      }
      // Denied: no write (avoids write-amplification under abuse); the bucket
      // refills from the stored timestamp on the next request.
      return false;
    });
    return { allowed };
  } catch (err) {
    logger.error(
      `Rate limit: Firestore error — denying (fail-closed): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return { allowed: false, reason: "limiter-error" };
  }
}
