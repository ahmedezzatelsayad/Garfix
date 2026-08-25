import { NextRequest, NextResponse } from "next/server";
import { fetchSafe } from "@/lib/ssrf";
import { getIntegrationConfig } from "@/lib/integrations/registry";
import { runAsPlatform } from "@/lib/tenant-context";

export async function GET(req: NextRequest) {
  // 1) اقرا الإعداد زي ما الـ initiate بيعمل
  const cfg = await runAsPlatform(() => getIntegrationConfig("myfatoorah"));
  // 2) جرب النداء بنفس طريقة callMyFatoorah
  let callResult = null;
  if (cfg?.base_url && cfg?.api_key) {
    try {
      const url = `${cfg.base_url.replace(/\/+$/, "")}/api/v2/InitiatePayment`;
      const res = await fetchSafe(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ InvoiceAmount: 10 }),
      });
      const data = await res.json();
      callResult = { status: res.status, ok: res.ok, url, body: JSON.stringify(data).slice(0, 150) };
    } catch (e) {
      callResult = { error: e instanceof Error ? e.message : String(e), url: cfg.base_url };
    }
  }
  return NextResponse.json({
    configKeys: cfg ? Object.keys(cfg) : null,
    baseUrl: cfg?.base_url ?? null,
    apiKeyPrefix: cfg?.api_key?.slice(0, 12) ?? null,
    callResult,
  });
}
