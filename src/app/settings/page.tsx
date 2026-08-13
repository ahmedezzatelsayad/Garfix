/**
 * /settings — AppShell settings view (AWS/Docker/Vercel).
 *
 * Always redirects to / where the AppShell loads the settings view.
 *
 * // FE-05 FIX (Audit v2 · Phase 1) — Vercel escape-hatch (VercelSettings)
 * deleted; the AppShell settings view is the single source of truth.
 *
 * DEPLOYMENT FIX: force-dynamic prevents prerender failure.
 */
export const dynamic = 'force-dynamic';
import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/");
}
