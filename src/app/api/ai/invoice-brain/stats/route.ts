/**
 * GET /api/ai/invoice-brain/stats
 *
 * Brain learning stats — the key metric for "is the AI cost actually going
 * down over time?". Returns template count, total hits (reuses), and the
 * pattern-vs-AI ratio from recent aiProcessingLog entries.
 *
 * Checklist 6.2.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/middleware";
import { withErrorHandler } from "@/lib/api";
import { PrismaPatternStore } from "@/lib/invoice-brain";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const access = await requirePermission(req, "bulk_input");
  if ("error" in access) return access.error;

  const store = new PrismaPatternStore();
  const { totalTemplates, totalHits } = await store.stats();

  // Pull recent brain extraction logs to compute the AI-vs-pattern ratio.
  // aiProcessingLog.success=true rows are extractions that produced orders;
  // we approximate the ratio from audit_logs (richer detail) if available,
  // else from the processing log counts.
  const recentLogs = await db.aIProcessingLog.findMany({
    where: { endpoint: "invoice-brain" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { success: true, createdAt: true, ordersCount: true, processingMs: true },
  });

  const recentAudits = await db.auditLog.findMany({
    where: { action: "invoice_brain_extract" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { details: true, createdAt: true },
  });

  let patternCount = 0;
  let aiCount = 0;
  let mixedCount = 0;
  for (const a of recentAudits) {
    try {
      const d = typeof a.details === "string" ? JSON.parse(a.details) : a.details;
      if (d?.source === "pattern") patternCount++;
      else if (d?.source === "ai") aiCount++;
      else if (d?.source === "mixed") mixedCount++;
    } catch {
      // skip malformed
    }
  }

  const totalExtractions = patternCount + aiCount + mixedCount;
  const aiRatio = totalExtractions > 0
    ? Number(((aiCount + mixedCount) / totalExtractions * 100).toFixed(1))
    : null;

  // Top templates by reuse (most valuable — highest sampleCount)
  const topTemplates = await db.invoiceBrainTemplate.findMany({
    orderBy: { sampleCount: "desc" },
    take: 5,
    select: { fingerprint: true, sampleCount: true, lastUsedAt: true, createdAt: true },
  });

  return NextResponse.json({
    ok: true,
    stats: {
      totalTemplates,
      totalHits,
      recentExtractions: totalExtractions,
      patternCount,
      aiCount,
      mixedCount,
      aiRatioPercent: aiRatio, // lower = more learning = lower cost
      topTemplates: topTemplates.map((t) => ({
        fingerprint: t.fingerprint,
        sampleCount: t.sampleCount,
        lastUsedAt: t.lastUsedAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
      })),
      recentLogs: recentLogs.slice(0, 10).map((l) => ({
        success: l.success,
        ordersCount: l.ordersCount,
        processingMs: l.processingMs,
        createdAt: l.createdAt.toISOString(),
      })),
    },
  });
});
