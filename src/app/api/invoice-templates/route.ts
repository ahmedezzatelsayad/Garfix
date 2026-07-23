/**
 * /api/invoice-templates
 * GET   — list templates for a company
 * POST  — create a new template
 * PATCH — save PDF template settings for a company
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermissionForCompany } from "@/lib/middleware";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";

const CreateSchema = z.object({
  companySlug: z.string().min(1),
  name: z.string().min(1, "الاسم مطلوب"),
  layoutType: z.enum(["classic", "modern", "minimal", "thermal"]).default("classic"),
  primaryColor: z.string().default("#7c3aed"),
  fontFamily: z.string().default("Cairo"),
  logoPosition: z.enum(["right", "left", "center"]).default("right"),
  showTaxNumber: z.boolean().default(true),
  showQrCode: z.boolean().default(false),
  showBankDetails: z.boolean().default(false),
  footerText: z.string().optional().nullable(),
  termsAndConditions: z.string().optional().nullable(),
  paperSize: z.enum(["A4", "Thermal80mm"]).default("A4"),
  isDefault: z.boolean().default(false),
});

const TemplateSettingsSchema = z.object({
  companySlug: z.string().min(1, "companySlug مطلوب"),
  templateId: z.enum(["classic", "modern", "minimal", "arabic-rtl"]).default("modern"),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "لون غير صالح").default("#7C3AED"),
  fontFamily: z.string().min(1, "الخط مطلوب").default("Noto Sans SC"),
  fontSize: z.number().int().min(8).max(24).default(12),
  showLogo: z.boolean().default(true),
  logoPosition: z.enum(["left", "center", "right"]).default("right"),
  showPaymentInfo: z.boolean().default(true),
  showStamp: z.boolean().default(false),
  invoiceTypes: z.array(z.enum(["sales", "purchase", "quote"])).min(1, "يجب اختيار نوع فاتورة واحد على الأقل").default(["sales", "purchase", "quote"]),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companySlug = sp.get("companySlug");
  if (!companySlug) return apiError("companySlug مطلوب", 400);

  const access = await requirePermissionForCompany(req, "settings_access", companySlug);
  if ("error" in access) return access.error;

  const templates = await db.invoiceTemplate.findMany({
    where: { companySlug },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  // Also fetch template settings if they exist
  const templateSettings = await db.invoiceTemplateSettings.findUnique({
    where: { companySlug },
  });

  return NextResponse.json({ templates, templateSettings });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Invalid input", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "settings_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // If isDefault, unset other defaults
  if (data.isDefault) {
    await db.invoiceTemplate.updateMany({
      where: { companySlug: data.companySlug, isDefault: true },
      data: { isDefault: false },
    });
  }

  const template = await db.invoiceTemplate.create({ data });
  await logAudit({
    userEmail: user.email, userUid: user.uid,
    action: "create", entity: "invoice_template", entityId: template.id,
    companySlug: data.companySlug,
  });
  return NextResponse.json({ ok: true, template });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = TemplateSettingsSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);
  const data = parsed.data;

  const access = await requirePermissionForCompany(req, "settings_access", data.companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Convert invoiceTypes array to comma-separated string
  const invoiceTypesStr = data.invoiceTypes.join(",");

  // Upsert: create if not exists, update if exists
  const settings = await db.invoiceTemplateSettings.upsert({
    where: { companySlug: data.companySlug },
    create: {
      companySlug: data.companySlug,
      templateId: data.templateId,
      primaryColor: data.primaryColor,
      fontFamily: data.fontFamily,
      fontSize: data.fontSize,
      showLogo: data.showLogo,
      logoPosition: data.logoPosition,
      showPaymentInfo: data.showPaymentInfo,
      showStamp: data.showStamp,
      invoiceTypes: invoiceTypesStr,
    },
    update: {
      templateId: data.templateId,
      primaryColor: data.primaryColor,
      fontFamily: data.fontFamily,
      fontSize: data.fontSize,
      showLogo: data.showLogo,
      logoPosition: data.logoPosition,
      showPaymentInfo: data.showPaymentInfo,
      showStamp: data.showStamp,
      invoiceTypes: invoiceTypesStr,
    },
  });

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "update",
    entity: "invoice_template_settings",
    entityId: settings.id,
    companySlug: data.companySlug,
  });

  return NextResponse.json({ ok: true, templateSettings: settings });
});
