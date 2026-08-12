/**
 * /dashboard — Dashboard page.
 *
 * AWS/Docker: redirects to / (AppShell loads dashboard view).
 * Vercel: pure HTML dashboard with inline JS.
 *
 * DEPLOYMENT FIX: force-dynamic prevents prerender failure.
 */
export const dynamic = 'force-dynamic';
import { redirect } from "next/navigation";
import VercelDashboard from "./VercelDashboard";

export default function DashboardPage() {
  // Vercel: show pure HTML dashboard
  if (process.env.VERCEL === "1") {
    return <VercelDashboard />;
  }

  // AWS/Docker: redirect to / (AppShell shows dashboard)
  redirect("/");
}
