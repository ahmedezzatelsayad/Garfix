/**
 * /api/ai/knowledge-base — قاعدة معرفة الشركة (Company KB).
 *
 * GET  — قائمة مستندات الشركة
 * POST — رفع مستند (multipart: file + kind + title) — يُستخرج النص ويُفهرس
 *        في AIMemoryEntry بفئة kb_* ليقرأه الوكيل في سياق ردوده.
 *
 * التخزين: النص المستخرج في AIMemoryEntry (جدول قائم) + Metadata للملف في
 * content JSON — بدون جداول جديدة، وجاهز للترقية لـ pgvector لاحقًا.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbTyped as db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { withErrorHandler, apiError } from "@/lib/api";
import { logger } from "@/lib/logger";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const MAX_DOC_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_KINDS = new Set(["policy", "catalog", "faq", "shipping", "pricing", "staff", "other"]);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await resolveAuth(req);
  if (!auth.ok || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const companySlug = req.nextUrl.searchParams.get("companySlug") || "";
  if (!companySlug || !assertCompanyAccess(auth.user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const notes = await db.aIMemoryNote.findMany({
    where: { companySlug, category: { startsWith: "kb_" } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({
    documents: notes.map((n) => {
      let meta: Record<string, unknown> = {};
      try { meta = JSON.parse(n.content || "{}") as Record<string, unknown>; } catch { /* raw text doc */ }
      return {
        id: String(n.id),
        title: (meta.title as string) || "مستند",
        kind: n.category.replace("kb_", ""),
        sizeBytes: meta.sizeBytes as number | undefined,
        createdAt: n.createdAt,
      };
    }),
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const rl = await rateLimitResponse(req, "post:kb", LIMITS.API_WRITE);
  if (rl) return rl;

  const auth = await resolveAuth(req);
  if (!auth.ok || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = auth.user;

  const form = await req.formData();
  const companySlug = String(form.get("companySlug") || "");
  const kindRaw = String(form.get("kind") || "other");
  const title = String(form.get("title") || "").slice(0, 200);
  const file = form.get("file");

  if (!companySlug || !assertCompanyAccess(user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(file instanceof File)) return apiError("الملف مطلوب", 400);
  if (file.size > MAX_DOC_BYTES) return apiError("الحد الأقصى 5 ميجابايت", 400);
  const kind = ALLOWED_KINDS.has(kindRaw) ? kindRaw : "other";

  // استخراج النص: نصوص مباشرة، وغيرها يُخزن باسم الملف + الحجم الآن
  // (استخراج PDF/DOCX الفوري يُضاف في مرحلة الـ RAG)
  let text = "";
  if (/\.(txt|md|csv|json)$/i.test(file.name) || file.type.startsWith("text/")) {
    text = (await file.text()).slice(0, 200_000);
  }

  await db.aIMemoryNote.create({
    data: {
      companySlug,
      category: `kb_${kind}`,
      entityId: null,
      content: JSON.stringify({
        title: title || file.name,
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
        textPreview: text.slice(0, 2000),
        text, // النص الكامل للأنواع النصية — يقرأه الوكيل
      }),
      confidence: 1.0,
      createdBy: user.uid,
    },
  });

  logger.info("[kb] document added", { companySlug, kind, fileName: file.name, size: file.size });
  return NextResponse.json({ ok: true }, { status: 201 });
});
