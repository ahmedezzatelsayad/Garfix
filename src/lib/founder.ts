/**
 * founder.ts — Single source of truth for the founder e-mail.
 * Read from environment so it can be rotated without a code change.
 *
 * Uses a getter function (not a module-level const) so that changes to
 * FOUNDER_EMAIL take effect immediately without a server restart.
 */

export function getFounderEmail(): string | null {
  // SECURITY FIX (Review H1 / 2026-08-24): no static fallback. A hardcoded
  // "founder@garfix.app" default meant that any deployment missing the
  // FOUNDER_EMAIL env var silently re-enabled the well-known founder
  // address — an account-takeover vector. Now: no env → no founder email,
  // and isFounderEmail() returns false for everyone (fail-closed).
  const env = process.env.FOUNDER_EMAIL;
  if (!env) {
    console.warn(
      "[founder] FOUNDER_EMAIL is not set — founder privileges are DISABLED " +
        "until it is configured (fail-closed)."
    );
    return null;
  }
  return env.trim().toLowerCase();
}

export function isFounderEmail(email: string | null | undefined): boolean {
  const founderEmail = getFounderEmail();
  if (!founderEmail) return false;
  if (!email) return false;
  return email.trim().toLowerCase() === founderEmail;
}
