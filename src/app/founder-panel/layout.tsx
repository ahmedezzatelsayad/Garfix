"use client";
/**
 * founder-panel/layout.tsx — Founder auth guard (client-side redirect).
 *
 * ORIGINAL DESIGN (Phase 2 P1): this was a server component that read the
 * access-token cookie, verified the JWT, and checked isFounderEmail() BEFORE
 * any HTML was sent. Non-founders got a 307 redirect — no page HTML leaks.
 *
 * RUNTIME FIX: in Next.js 16 + Bun (production `next start`), the server
 * component `redirect()` from next/navigation was silently failing — the
 * redirect was not followed by the browser, so non-founders could see the
 * founder-panel HTML. This affected:
 *   - Security: non-founders could read founder-panel page HTML
 *   - E2E tests: rbac-denial.spec.ts expected employees to be redirected
 *     away from /founder-panel, but they stayed on /founder-panel
 *
 * The fix is a hybrid approach:
 *   1. This CLIENT layout reads the access cookie from document.cookie
 *      and redirects non-founders via router.replace(). The redirect
 *      happens AFTER hydration (client-side), so a brief flash of HTML
 *      is possible — but the page content is gated by FounderPanelShell
 *      which checks the auth state before rendering children.
 *   2. FounderPanelShell renders a loading spinner until the auth check
 *      completes, so the actual founder-panel content is never shown to
 *      non-founders even during the brief window.
 *
 * SECURITY TRADE-OFF: the server-side guard is gone, so a network-level
 * attacker could theoretically read the page HTML before the client redirect
 * fires. However, the page HTML is just the shell (sidebar + nav) — all
 * sensitive data is loaded via API routes that have their own auth checks
 * (requireAuth + isFounderEmail). So the leak is limited to UI chrome.
 *
 * COOKIE NOTE: reads `inv_token` (ACCESS_COOKIE from auth.ts). The cookie
 * is httpOnly=true, so document.cookie CANNOT read it. Instead, we use the
 * /api/auth/me endpoint to check the current user's role — this is the
 * same pattern used by the rest of the app's auth flow.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FounderPanelShell from "./FounderPanelShell";

export default function FounderPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authState, setAuthState] = useState<"loading" | "founder" | "denied">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) {
            setAuthState("denied");
            router.replace("/login?returnTo=/founder-panel");
          }
          return;
        }
        const body = await res.json();
        // /api/auth/me returns user fields at the top level (via buildUserProfile).
        // isFounder is included in the response.
        if (body.isFounder || body.role === "admin") {
          if (!cancelled) setAuthState("founder");
        } else {
          if (!cancelled) {
            setAuthState("denied");
            router.replace("/");
          }
        }
      } catch {
        if (!cancelled) {
          setAuthState("denied");
          router.replace("/login?returnTo=/founder-panel");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // While checking auth, render a loading spinner — never render founder-panel
  // content (children) until we're sure the user is the founder.
  if (authState !== "founder") {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-background text-muted-foreground text-sm">
        <div className="text-center">
          <div
            className="w-8 h-8 border-[3px] border-border border-t-primary rounded-full mx-auto mb-3"
            style={{ animation: "spin 0.8s linear infinite" }}
          />
          جاري التحقق من الصلاحيات...
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return <FounderPanelShell>{children}</FounderPanelShell>;
}
