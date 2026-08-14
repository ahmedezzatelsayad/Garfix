/**
 * founder-panel/layout.tsx — Server-side founder auth guard.
 *
 * Phase 2 P1 fix: previously the founder-panel layout was a client component
 * ("use client") that rendered the entire page HTML to the browser, then
 * FounderGuard (a client-only useEffect) redirected non-founders AFTER
 * hydration. A network-level attacker could read the full page HTML before
 * the redirect fired.
 *
 * Now this layout is a SERVER component. It reads the access-token cookie,
 * verifies the JWT, and checks isFounderEmail() BEFORE any HTML is sent.
 * Non-founders get a 307 redirect to / — no page HTML leaks.
 *
 * The original client layout (sidebar, navigation) is now FounderPanelShell,
 * imported as a client component child.
 *
 * COOKIE FIX: previously read `garfix_access` which is NEVER set by
 * src/lib/auth.ts (it sets `inv_token`). This caused EVERY user — including
 * the actual founder — to be redirected to /login, making the entire
 * founder-panel unreachable. Now we import ACCESS_COOKIE from auth.ts to
 * guarantee the cookie name stays in sync with the issuer.
 *
 * COOKIE READ FIX: use `headers()` to read the raw Cookie header instead of
 * `next/headers` cookies(). In some Next.js + Bun combinations, `cookies()`
 * may not return the access cookie reliably for server components. Reading
 * the raw `cookie` header and parsing it manually is the most robust approach
 * and works identically across runtimes.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import FounderPanelShell from "./FounderPanelShell";

/** Parse a specific cookie value from the raw Cookie header. */
function readCookieFromHeader(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const prefix = name + "=";
  const parts = cookieHeader.split(/;\s*/);
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return undefined;
}

export default async function FounderPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Phase 2 P1 fix: server-side auth check before rendering ANY founder-panel HTML.
  // Read the raw Cookie header directly — more robust than next/headers cookies()
  // across Next.js + Bun runtime combinations.
  const headerList = await headers();
  const cookieHeader = headerList.get("cookie");
  const accessToken = readCookieFromHeader(cookieHeader, ACCESS_COOKIE);

  if (!accessToken) {
    // Not logged in → redirect to login with returnTo
    redirect("/login?returnTo=/founder-panel");
  }

  const payload = verifyToken(accessToken);
  if (!payload) {
    // Token invalid/expired → redirect to login
    redirect("/login?returnTo=/founder-panel&reason=expired");
  }

  if (!isFounderEmail(payload.email)) {
    // Logged in but NOT founder → redirect to dashboard
    redirect("/");
  }

  // Founder confirmed — render the client shell (sidebar + nav)
  return <FounderPanelShell>{children}</FounderPanelShell>;
}
