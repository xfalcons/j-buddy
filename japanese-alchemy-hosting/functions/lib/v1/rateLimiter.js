"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRateLimit = exports.rateLimitKey = exports.RATE_LIMIT_REFILL_PER_MIN = exports.RATE_LIMIT_CAPACITY = void 0;
const crypto_1 = require("crypto");
const firestore_1 = require("firebase-admin/firestore");
const logger_1 = require("../utils/logger");
// Token-bucket config per client IP. Tuned for a low-traffic extension; raise
// if legitimate usage needs more headroom.
exports.RATE_LIMIT_CAPACITY = 20;
exports.RATE_LIMIT_REFILL_PER_MIN = 20;
const RATE_LIMIT_COLLECTION = "rateLimits";
const REFILL_INTERVAL_MS = (60 * 1000) / exports.RATE_LIMIT_REFILL_PER_MIN;
// Server-side HMAC key. It lives in deployed source (not a rotated secret), so
// it does not stop a GCP-insider threat — but the anonymous attacker this layer
// defends against cannot read it, making the IP identifier non-trivially
// reversible over the IPv4 space (unlike a bare hash). Rotate by changing the
// salt and the collection name together.
const IP_HMAC_KEY = "j-buddy-ratelimit-ip-key-v1";
/** Deterministic, non-reversible-at-rest identifier for a client IP. */
function rateLimitKey(ip) {
    return (0, crypto_1.createHmac)("sha256", IP_HMAC_KEY).update(ip).digest("hex");
}
exports.rateLimitKey = rateLimitKey;
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
async function checkRateLimit(ip) {
    if (!ip) {
        logger_1.logger.warn("Rate limit: missing client IP — allowing (fail-open)");
        return { allowed: true, reason: "no-ip" };
    }
    const ref = (0, firestore_1.getFirestore)().collection(RATE_LIMIT_COLLECTION).doc(rateLimitKey(ip));
    try {
        const allowed = await (0, firestore_1.getFirestore)().runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const now = Date.now();
            let tokens = exports.RATE_LIMIT_CAPACITY;
            if (snap.exists) {
                const data = snap.data();
                const updatedAt = data.updatedAt ?? now;
                const elapsed = now - updatedAt;
                tokens = Math.min(exports.RATE_LIMIT_CAPACITY, (data.tokens ?? 0) + elapsed / REFILL_INTERVAL_MS);
            }
            if (tokens >= 1) {
                tx.set(ref, { tokens: tokens - 1, updatedAt: now });
                return true;
            }
            // Denied: no write (avoids write-amplification under abuse); the bucket
            // refills from the stored timestamp on the next request.
            return false;
        });
        return { allowed };
    }
    catch (err) {
        logger_1.logger.error(`Rate limit: Firestore error — denying (fail-closed): ${err instanceof Error ? err.message : String(err)}`);
        return { allowed: false, reason: "limiter-error" };
    }
}
exports.checkRateLimit = checkRateLimit;
//# sourceMappingURL=rateLimiter.js.map