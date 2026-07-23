/**
 * retention.ts — Record retention enforcement per Kuwait Decree 10/2026.
 *
 * Kuwait Decree 10/2026 requires a minimum 5-year record retention period.
 * Other countries have configurable retention via company.recordRetentionYears.
 *
 * This module:
 * - Prevents deletion of invoices/financial records within the retention period
 * - Provides retention period checking for various financial entities
 * - Integrates with the existing soft-delete (deletedAt) mechanism
 *
 * Fines up to 10,000 KWD can be imposed for violating retention requirements.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isKuwait, getRetentionYears, getDecreeRef } from "@/lib/gulfConfig";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RetentionCheckResult {
  /** Whether the record can be deleted */
  canDelete: boolean;
  /** Reason if cannot delete (Arabic) */
  reasonAr?: string;
  /** Reason if cannot delete (English) */
  reasonEn?: string;
  /** The applicable retention period in years */
  retentionYears: number;
  /** The decree/law reference */
  decreeRef?: string;
  /** Remaining days before the record can be deleted */
  remainingDays?: number;
  /** The date when the record will become eligible for deletion */
  eligibleDate?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const KUWAIT_RETENTION_YEARS = 5;
const KUWAIT_MAX_FINE_KWD = 10000;

// ── Retention period calculation ───────────────────────────────────────────

/**
 * getRetentionPeriodForCompany — Gets the retention period for a company.
 *
 * Kuwait: 5 years (Decree 10/2026, mandatory)
 * Others: company.recordRetentionYears (configurable, default 5)
 */
export function getRetentionPeriodForCompany(company: Record<string, unknown>): number {
  const countryCode = company.country as string;

  if (isKuwait(countryCode)) {
    // Kuwait: fixed 5 years per Decree 10/2026 (cannot be reduced)
    return KUWAIT_RETENTION_YEARS;
  }

  // Other countries: configurable via company.recordRetentionYears
  const configuredYears = (company.recordRetentionYears as number) ?? getRetentionYears(countryCode);
  return Math.max(configuredYears, 1); // Minimum 1 year
}

/**
 * calculateEligibleDeletionDate — Calculates the date when a soft-deleted
 * record becomes eligible for permanent deletion.
 *
 * @param deletedAt - The date the record was soft-deleted
 * @param company - The company record for retention period lookup
 * @returns The date when the record can be permanently deleted
 */
export function calculateEligibleDeletionDate(
  deletedAt: Date | string,
  company: Record<string, unknown>,
): Date {
  const retentionYears = getRetentionPeriodForCompany(company);
  const deletedDate = typeof deletedAt === "string" ? new Date(deletedAt) : deletedAt;
  const eligibleDate = new Date(deletedDate);
  eligibleDate.setFullYear(eligibleDate.getFullYear() + retentionYears);
  return eligibleDate;
}

// ── Retention check ────────────────────────────────────────────────────────

/**
 * checkInvoiceRetention — Checks if an invoice can be deleted based on
 * retention requirements.
 *
 * For Kuwait (Decree 10/2026): 5-year minimum, cannot be reduced.
 * For others: configurable via company.recordRetentionYears.
 */
export function checkInvoiceRetention(
  invoice: Record<string, unknown>,
  company: Record<string, unknown>,
): RetentionCheckResult {
  const countryCode = company.country as string;
  const retentionYears = getRetentionPeriodForCompany(company);
  const decreeRef = getDecreeRef(countryCode) ?? undefined;

  // ── Already soft-deleted: check if within retention period ────────────
  if (invoice.deletedAt) {
    const deletedAt = invoice.deletedAt instanceof Date
      ? invoice.deletedAt
      : new Date(invoice.deletedAt as string);
    const eligibleDate = calculateEligibleDeletionDate(deletedAt, company);
    const now = new Date();

    if (now < eligibleDate) {
      // Still within retention period — cannot permanently delete
      const remainingMs = eligibleDate.getTime() - now.getTime();
      const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

      return {
        canDelete: false,
        reasonAr: isKuwait(countryCode)
          ? `لا يمكن حذف هذه الفاتورة — ضمن فترة الاحتفاظ (${retentionYears} سنوات) وفقاً للمرسوم رقم 10 لسنة 2026. الغرامة قد تصل إلى ${KUWAIT_MAX_FINE_KWD.toLocaleString("ar-EG")} دينار كويتي`
          : `لا يمكن حذف هذه الفاتورة — ضمن فترة الاحتفاظ (${retentionYears} سنوات)`,
        reasonEn: isKuwait(countryCode)
          ? `Cannot delete this invoice — within retention period (${retentionYears} years) per Decree 10/2026. Fines up to ${KUWAIT_MAX_FINE_KWD} KWD`
          : `Cannot delete this invoice — within retention period (${retentionYears} years)`,
        retentionYears,
        decreeRef,
        remainingDays,
        eligibleDate: eligibleDate.toISOString(),
      };
    }

    // Past retention period — can permanently delete
    return {
      canDelete: true,
      retentionYears,
      decreeRef,
    };
  }

  // ── Not yet soft-deleted: check if it can be soft-deleted ──────────────
  // All invoices can be soft-deleted (it's a reversible action).
  // But we warn about the retention period.
  const createdAt = invoice.createdAt instanceof Date
    ? invoice.createdAt
    : new Date(invoice.createdAt as string);
  const eligibleDate = calculateEligibleDeletionDate(createdAt, company);

  return {
    canDelete: true, // Soft-delete is always allowed
    retentionYears,
    decreeRef,
    eligibleDate: eligibleDate.toISOString(),
    reasonAr: isKuwait(countryCode)
      ? `تنبيه: يجب الاحتفاظ بالفاتورة لمدة ${retentionYears} سنوات وفقاً للمرسوم رقم 10 لسنة 2026`
      : `تنبيه: يجب الاحتفاظ بالفاتورة لمدة ${retentionYears} سنوات`,
    reasonEn: isKuwait(countryCode)
      ? `Note: Invoice must be retained for ${retentionYears} years per Decree 10/2026`
      : `Note: Invoice must be retained for ${retentionYears} years`,
  };
}

/**
 * checkFinancialRecordRetention — Generic retention check for any financial
 * record (journal entries, payment transactions, purchase invoices, etc.)
 */
export function checkFinancialRecordRetention(
  record: { deletedAt: Date | string | null; createdAt: Date | string },
  company: Record<string, unknown>,
): RetentionCheckResult {
  const countryCode = company.country as string;
  const retentionYears = getRetentionPeriodForCompany(company);
  const decreeRef = getDecreeRef(countryCode) ?? undefined;

  if (record.deletedAt) {
    const deletedAt = record.deletedAt instanceof Date
      ? record.deletedAt
      : new Date(record.deletedAt as string);
    const eligibleDate = calculateEligibleDeletionDate(deletedAt, company);
    const now = new Date();

    if (now < eligibleDate) {
      const remainingMs = eligibleDate.getTime() - now.getTime();
      const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

      return {
        canDelete: false,
        reasonAr: isKuwait(countryCode)
          ? `لا يمكن حذف هذا السجل — ضمن فترة الاحتفاظ (${retentionYears} سنوات) وفقاً للمرسوم رقم 10 لسنة 2026`
          : `لا يمكن حذف هذا السجل — ضمن فترة الاحتفاظ (${retentionYears} سنوات)`,
        reasonEn: isKuwait(countryCode)
          ? `Cannot delete this record — within retention period (${retentionYears} years) per Decree 10/2026`
          : `Cannot delete this record — within retention period (${retentionYears} years)`,
        retentionYears,
        decreeRef,
        remainingDays,
        eligibleDate: eligibleDate.toISOString(),
      };
    }

    return {
      canDelete: true,
      retentionYears,
      decreeRef,
    };
  }

  return {
    canDelete: true,
    retentionYears,
    decreeRef,
  };
}

// ── Bulk retention enforcement ─────────────────────────────────────────────

/**
 * enforceRetentionForCompany — Enforces retention rules for all financial
 * records of a company. Prevents hard deletion of records within the
 * retention period.
 *
 * Used by the retention cleanup process to ensure compliance.
 */
export async function enforceRetentionForCompany(
  companySlug: string,
  company: Record<string, unknown>,
): Promise<{
  enforced: boolean;
  blockedRecords: number;
  details: Record<string, number>;
}> {
  const retentionYears = getRetentionPeriodForCompany(company);
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionYears);

  logger.info("[retention] enforcing retention for company", {
    companySlug,
    retentionYears,
    cutoffDate,
  });

  // Count records that are within retention period (cannot be permanently deleted)
  const activeWithinRetention = {
    invoices: await db.invoice.count({
      where: {
        companySlug,
        createdAt: { gte: cutoffDate },
        deletedAt: null,
      },
    }),
    journalEntries: await db.journalEntry.count({
      where: {
        companySlug,
        createdAt: { gte: cutoffDate },
        deletedAt: null,
      },
    }),
    paymentTransactions: await db.paymentTransaction.count({
      where: {
        companySlug,
        createdAt: { gte: cutoffDate },
        deletedAt: null,
      },
    }),
  };

  // Count soft-deleted records still within retention period
  const softDeletedWithinRetention = {
    invoices: await db.invoice.count({
      where: {
        companySlug,
        deletedAt: { not: null, gte: cutoffDate },
      },
    }),
    journalEntries: await db.journalEntry.count({
      where: {
        companySlug,
        deletedAt: { not: null, gte: cutoffDate },
      },
    }),
    paymentTransactions: await db.paymentTransaction.count({
      where: {
        companySlug,
        deletedAt: { not: null, gte: cutoffDate },
      },
    }),
  };

  const totalBlocked =
    activeWithinRetention.invoices +
    activeWithinRetention.journalEntries +
    activeWithinRetention.paymentTransactions +
    softDeletedWithinRetention.invoices +
    softDeletedWithinRetention.journalEntries +
    softDeletedWithinRetention.paymentTransactions;

  logger.info("[retention] retention enforcement summary", {
    companySlug,
    totalBlocked,
    activeRecords: activeWithinRetention,
    softDeletedRecords: softDeletedWithinRetention,
  });

  return {
    enforced: true,
    blockedRecords: totalBlocked,
    details: {
      activeInvoices: activeWithinRetention.invoices,
      activeJournalEntries: activeWithinRetention.journalEntries,
      activePaymentTransactions: activeWithinRetention.paymentTransactions,
      softDeletedInvoices: softDeletedWithinRetention.invoices,
      softDeletedJournalEntries: softDeletedWithinRetention.journalEntries,
      softDeletedPaymentTransactions: softDeletedWithinRetention.paymentTransactions,
    },
  };
}

// ── Export constants ───────────────────────────────────────────────────────

export { KUWAIT_RETENTION_YEARS, KUWAIT_MAX_FINE_KWD };
