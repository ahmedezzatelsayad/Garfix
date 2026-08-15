/**
 * founder.ts — Single source of truth for the founder e-mail.
 * Read from environment so it can be rotated without a code change.
 *
 * Uses a getter function (not a module-level const) so that changes to
 * FOUNDER_EMAIL take effect immediately without a server restart.
 */

export function getFounderEmail(): string {
  const env = process.env.FOUNDER_EMAIL;
  if (!env) {
    // Fallback for dev — production should always set FOUNDER_EMAIL.
    return "founder@garfix.app";
  }
  return env.trim().toLowerCase();
}

export function isFounderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === getFounderEmail();
}
