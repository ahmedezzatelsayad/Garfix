/**
 * /clients — Pure HTML clients page (Vercel) / AppShell view (AWS).
 */
import { redirect } from "next/navigation";
import VercelClients from "./VercelClients";

export default function ClientsPage() {
  if (process.env.VERCEL === "1") {
    return <VercelClients />;
  }
  redirect("/");
}
