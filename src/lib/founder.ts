/**
 * founder.ts — Single source of truth for the founder e-mail.
 * Read from environment so it can be rotated without a code change.
 */

function resolveFounderEmail(): string {
  const env = process.env.FOUNDER_EMAIL;
  if (!env) {
    // Fallback for dev — production should always set FOUNDER_EMAIL.
    return "founder@garfix.app";
  }
  return env.trim().toLowerCase();
}

export const FOUNDER_EMAIL: string = resolveFounderEmail();

export function isFounderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === FOUNDER_EMAIL;
}
