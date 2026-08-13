/**
 * /dashboard — Dashboard page.
 *
 * AWS/Docker/Vercel: redirects to / (AppShell loads dashboard view).
 *
 * // FE-05 FIX (Audit v2 · Phase 1) — Vercel escape-hatch (VercelDashboard)
 * deleted; the AppShell dashboard view is the single source of truth.
 *
 * DEPLOYMENT FIX: force-dynamic prevents prerender failure.
 */
export const dynamic = 'force-dynamic';
import { redirect } from "next/navigation";

export default function DashboardPage() {
  redirect("/");
}
