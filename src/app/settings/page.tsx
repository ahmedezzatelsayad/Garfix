/**
 * /settings — Pure HTML settings page (Vercel) / AppShell view (AWS).
 *
 * DEPLOYMENT FIX: force-dynamic prevents prerender failure.
 */
export const dynamic = 'force-dynamic';
import { redirect } from "next/navigation";
import VercelSettings from "./VercelSettings";

export default function SettingsPage() {
  if (process.env.VERCEL === "1") {
    return <VercelSettings />;
  }
  redirect("/");
}
