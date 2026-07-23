/**
 * cost-per-invoice.ts — Phase 15: AI cost attribution per invoice.
 *
 * Links invoices to their AI costs from AIRequestLog:
 *   - If invoice was resolved by cache/rule/pattern/memory → AI cost = $0
 *     (only infra cost, estimated at $0.0001)
 *   - If resolved by AI → use actual costUsd from AIRequestLog
 *
 * Exports:
 *   getCostPerInvoice(companySlug, period)      → average cost per invoice
 *   getCostPerInvoiceTrend(companySlug, periods) → trend data for charting
 *   linkInvoiceCost(invoiceId, aiRequestLogId)   → explicit cost linking
 */

import { db } from "@/lib/db";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Infra-only cost for non-AI resolved invoices. */
const INFRA_COST_PER_INVOICE = 0.0001;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CostPerInvoiceResult {
  companySlug: string;
  period: string;
  totalInvoices: number;
  totalAiCostUsd: number;
  avgCostPerInvoice: number;
  aiResolvedCount: number;
  nonAiResolvedCount: number;
}

export interface CostPerInvoiceTrendPoint {
  period: string;
  avgCostPerInvoice: number;
  totalInvoices: number;
  aiCostUsd: number;
}

// ─── Exported: getCostPerInvoice ────────────────────────────────────────────

/**
 * Calculate the average AI cost per invoice for a company in a period.
 *
 * For each invoice created in the period, we check if there's a corresponding
 * AIRequestLog entry. If the invoice was resolved by AI, we use the actual cost.
 * Otherwise, we assign the infra-only cost ($0.0001).
 *
 * Since invoices and AIRequestLog are separate tables linked by companySlug
 * and approximate time, we use a time-correlation approach:
 *   - For each AI-resolved request, count it as an AI cost invoice
 *   - For non-AI resolved requests, assign infra cost
 *   - For invoices without any AI log entry, assign infra cost
 */
export async function getCostPerInvoice(
  companySlug: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<CostPerInvoiceResult> {
  // Get all AI request logs for this company in the period
  const aiLogs = await db.aIRequestLog.findMany({
    where: {
      companySlug,
      createdAt: { gte: periodStart, lt: periodEnd },
    },
    select: {
      resolvedBy: true,
      costUsd: true,
    },
  });

  // Get invoices created in the period
  const invoiceCount = await db.invoice.count({
    where: {
      companySlug,
      createdAt: { gte: periodStart, lt: periodEnd },
      deletedAt: null,
    },
  });

  // Calculate costs from AI logs
  const aiResolvedLogs = aiLogs.filter((l) => l.resolvedBy === "ai");
  const nonAiResolvedLogs = aiLogs.filter((l) => l.resolvedBy !== "ai");

  const aiCostTotal = aiResolvedLogs.reduce((sum, l) => sum + l.costUsd, 0);
  const nonAiCostTotal = nonAiResolvedLogs.length * INFRA_COST_PER_INVOICE;

  // Invoices without AI logs get infra cost
  const invoicesWithLogs = aiLogs.length;
  const invoicesWithoutLogs = Math.max(0, invoiceCount - invoicesWithLogs);
  const unlinkedCost = invoicesWithoutLogs * INFRA_COST_PER_INVOICE;

  const totalCost = aiCostTotal + nonAiCostTotal + unlinkedCost;
  const totalInvoices = invoiceCount || aiLogs.length; // use logs if no invoices
  const avgCostPerInvoice = totalInvoices > 0
    ? Math.round((totalCost / totalInvoices) * 1e8) / 1e8
    : 0;

  const period = periodStart.toISOString().slice(0, 10);

  return {
    companySlug,
    period,
    totalInvoices,
    totalAiCostUsd: Math.round(totalCost * 1e8) / 1e8,
    avgCostPerInvoice,
    aiResolvedCount: aiResolvedLogs.length,
    nonAiResolvedCount: nonAiResolvedLogs.length,
  };
}

// ─── Exported: getCostPerInvoiceTrend ───────────────────────────────────────

/**
 * Get cost-per-invoice trend data for charting.
 * Returns one data point per day for the requested number of periods.
 *
 * @param companySlug — company to analyze
 * @param days        — number of days to look back
 */
export async function getCostPerInvoiceTrend(
  companySlug: string,
  days: number,
): Promise<CostPerInvoiceTrendPoint[]> {
  const trend: CostPerInvoiceTrendPoint[] = [];
  const now = new Date();

  for (let d = days - 1; d >= 0; d--) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const result = await getCostPerInvoice(companySlug, dayStart, dayEnd);

    trend.push({
      period: result.period,
      avgCostPerInvoice: result.avgCostPerInvoice,
      totalInvoices: result.totalInvoices,
      aiCostUsd: result.totalAiCostUsd,
    });
  }

  return trend;
}

// ─── Exported: linkInvoiceCost ──────────────────────────────────────────────

/**
 * Explicitly link an invoice to an AI request log entry for cost attribution.
 * This is called when the system creates an invoice via the AI cascade,
 * recording the AIRequestLog.id that generated it.
 *
 * In this implementation, we update the invoice's source field to include
 * the AI request log reference. This allows precise cost-per-invoice tracking.
 */
export async function linkInvoiceCost(
  invoiceId: number,
  aiRequestLogId: number,
): Promise<void> {
  const log = await db.aIRequestLog.findUnique({
    where: { id: aiRequestLogId },
  });

  if (!log) return;

  // Store the AI request log reference in the invoice's source field
  // Format: "ai-fabric:logId:resolvedBy:costUsd"
  const sourceTag = `ai-fabric:${aiRequestLogId}:${log.resolvedBy}:${log.costUsd}`;

  await db.invoice.update({
    where: { id: invoiceId },
    data: { source: sourceTag },
  });
}

/**
 * Parse the AI cost from an invoice's source field.
 * Returns null if the invoice wasn't linked via linkInvoiceCost.
 */
export function parseInvoiceAiCost(invoiceSource: string | null): { aiCostUsd: number; resolvedBy: string } | null {
  if (!invoiceSource || !invoiceSource.startsWith("ai-fabric:")) return null;

  const parts = invoiceSource.split(":");
  if (parts.length < 4) return null;

  return {
    aiCostUsd: parseFloat(parts[3]) || 0,
    resolvedBy: parts[2],
  };
}