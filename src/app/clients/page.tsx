/**
 * /clients — Pure HTML clients page (Vercel) / AppShell view (AWS).
 * Vercel: fetches /api/clients and renders cards with inline JS.
 * AWS: redirects to / (AppShell loads clients view).
 *
 * DEPLOYMENT FIX: force-dynamic prevents prerender failure when
 * process.env.VERCEL is undefined during next build.
 */
export const dynamic = 'force-dynamic';
import { redirect } from "next/navigation";
import VercelClients from "./VercelClients";

export default function ClientsPage() {
  if (process.env.VERCEL === "1") {
    return <VercelClients />;
  }
  redirect("/");
}
