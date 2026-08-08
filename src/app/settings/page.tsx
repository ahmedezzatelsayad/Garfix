/**
 * /settings — Pure HTML settings page (Vercel) / AppShell view (AWS).
 */
import { redirect } from "next/navigation";
import VercelSettings from "./VercelSettings";

export default function SettingsPage() {
  if (process.env.VERCEL === "1") {
    return <VercelSettings />;
  }
  redirect("/");
}
