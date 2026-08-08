/**
 * /invoices — Pure HTML invoices page (Vercel) / AppShell view (AWS).
 * Vercel: fetches /api/invoices and renders table with inline JS.
 * AWS: redirects to / (AppShell loads invoices view).
 */
import { redirect } from "next/navigation";
import VercelInvoices from "./VercelInvoices";

export default function InvoicesPage() {
  if (process.env.VERCEL === "1") {
    return <VercelInvoices />;
  }
  redirect("/");
}
