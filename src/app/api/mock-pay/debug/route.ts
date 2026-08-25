/**
 * SANDBOX DEBUG (dev/test only) — يشخّص لماذا fetchSafe يفشل بالـ 403
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchSafe } from "@/lib/ssrf";

export async function GET(req: NextRequest) {
  const target = new URL(req.url).searchParams.get("target") ||
    `${new URL(req.url).origin}/api/mock-pay/InitiatePayment`;
  try {
    const res = await fetchSafe(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ InvoiceAmount: 10 }),
    });
    const body = await res.text();
    return NextResponse.json({ ok: true, status: res.status, body: body.slice(0, 200) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
