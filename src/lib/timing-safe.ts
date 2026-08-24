/**
 * timing-safe.ts — constant-time string comparison for Node.js runtime.
 *
 * Review fix (L2): several token comparisons (METRICS_TOKEN, CRON_SECRET,
 * webhook verify tokens) used plain `!==` equality, which short-circuits on
 * the first differing byte and leaks timing information about the expected
 * secret's content/length. This helper compares every byte unconditionally.
 *
 * Edge-runtime note: src/middleware.ts has its own inline copy
 * (timingSafeEqualStr) because middleware can't import node:crypto.
 */
import { timingSafeEqual } from "node:crypto";

export function timingSafeEqualStr(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    // Compare against self to keep constant time, then fail.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}
