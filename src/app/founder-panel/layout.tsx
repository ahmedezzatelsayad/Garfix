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
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";
import { isFounderEmail } from "@/lib/founder";
import FounderPanelShell from "./FounderPanelShell";

export default async function FounderPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Phase 2 P1 fix: server-side auth check before rendering ANY founder-panel HTML.
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;

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
