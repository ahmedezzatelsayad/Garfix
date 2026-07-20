/**
 * /api/modules
 * GET — list installed modules (with active state)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api";
import { parseJsonField } from "@/lib/api";

// Built-in module definitions (always available)
export const BUILTIN_MODULES = [
  { name: "الفواتير", identifier: "invoices", version: "1.0.0", description: "إنشاء وإدارة الفواتير", isActive: true, builtIn: true },
  { name: "العملاء", identifier: "clients", version: "1.0.0", description: "قاعدة بيانات العملاء", isActive: true, builtIn: true },
  { name: "المشتريات", identifier: "purchases", version: "1.0.0", description: "إدارة فواتير الموردين", isActive: true, builtIn: true },
  { name: "الموارد البشرية", identifier: "hr", version: "1.0.0", description: "الموظفون والرواتب والحضور", isActive: true, builtIn: true },
  { name: "المحاسبة", identifier: "accounting", version: "1.0.0", description: "دليل الحسابات والقيود اليومية", isActive: true, builtIn: true },
  { name: "الفاتورة الإلكترونية", identifier: "e_invoicing", version: "1.0.0", description: "ربط مع هيئة الزكاة والضريبة (ZATCA)", isActive: false, builtIn: true },
  { name: "مساعد الذكاء الاصطناعي", identifier: "ai_copilot", version: "1.0.0", description: "مساعد ذكي للأعمال", isActive: true, builtIn: true },
  { name: "مدفوعات ستارايب", identifier: "payment_gateway", version: "1.0.0", description: "تكامل Stripe للاشتراكات", isActive: false, builtIn: true },
];

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbModules = await db.module.findMany();
  const dbMap = new Map(dbModules.map((m) => [m.identifier, m]));

  const merged = BUILTIN_MODULES.map((b) => {
    const dbM = dbMap.get(b.identifier);
    return {
      ...b,
      id: dbM?.id,
      isActive: dbM?.isActive ?? b.isActive,
      settings: dbM?.settings ? parseJsonField(dbM.settings, {}) : {},
      installedAt: dbM?.installedAt,
    };
  });

  return NextResponse.json({ modules: merged });
});
