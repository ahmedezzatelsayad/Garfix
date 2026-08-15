/**
 * /clients — AppShell clients view (AWS/Docker/Vercel).
 *
 * Always redirects to / where the AppShell loads the clients view.
 *
 * // FE-05 FIX (Audit v2 · Phase 1) — Vercel escape-hatch (VercelClients)
 * deleted; the AppShell clients view is the single source of truth.
 *
 * DEPLOYMENT FIX: force-dynamic prevents prerender failure when
 * process.env.VERCEL is undefined during next build.
 */
export const dynamic = 'force-dynamic';
import { redirect } from "next/navigation";

export default function ClientsPage() {
  redirect("/");
}
