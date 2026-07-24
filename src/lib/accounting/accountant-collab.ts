/**
 * accountant-collab.ts — Phase 12: Accountant Collaboration
 *
 * Features:
 *  - External accountant access management (read_only, limited_edit, full_edit)
 *  - Excel export data generation (trial_balance, general_ledger, journal_entries, full_package)
 *  - Accounting-specific audit logging (separate from general AuditLog)
 *  - Accounting audit trail queries
 */

import { db } from "@/lib/db";
import { num } from "@/lib/money";
import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccountantAccessLevel = "read_only" | "limited_edit" | "full_edit";

export interface AccountantAccessResult {
  id: number;
  companySlug: string;
  accountantEmail: string;
  accessLevel: AccountantAccessLevel;
  permissionsGranted: string[];
  createdAt: Date;
}

export type ExportType = "trial_balance" | "general_ledger" | "journal_entries" | "full_package";

export interface ExportResult {
  fileName: string;
  data: Record<string, unknown>;
}

// ─── Permission Mapping ──────────────────────────────────────────────────────

const ACCESS_LEVEL_PERMISSIONS: Record<AccountantAccessLevel, string[]> = {
  read_only: ["finance_access"], // view only — the route checks permission but the role won't allow mutations
  limited_edit: ["finance_access", "create_journal_entry"], // can create JEs but not post
  full_edit: ["finance_access", "create_journal_entry", "post_journal_entry", "create_invoice", "create_voucher"],
};

// ─── 1. createExternalAccountantAccess ────────────────────────────────────────

export async function createExternalAccountantAccess(
  companySlug: string,
  accountantEmail: string,
  accessLevel: AccountantAccessLevel,
): Promise<AccountantAccessResult> {
  const permissions = ACCESS_LEVEL_PERMISSIONS[accessLevel];

  // Create a role for this accountant scoped to this company.
  // The role name encodes the company + email so it's unique.
  const roleName = `ext_accountant_${companySlug}_${accountantEmail.replace(/[^a-zA-Z0-9]/g, "_")}`;

  // Upsert RolePermission entries for each permission key
  for (const permKey of permissions) {
    await db.rolePermission.upsert({
      where: {
        role_permissionKey_companySlug: {
          role: roleName,
          permissionKey: permKey,
          companySlug,
        },
      },
      update: { value: 1 },
      create: {
        role: roleName,
        permissionKey: permKey,
        companySlug,
        value: 1,
      },
    });
  }

  // Also ensure the accountant user has this company in their companies list
  const user = await db.appUser.findUnique({ where: { email: accountantEmail } });
  if (user) {
    const companies: string[] = JSON.parse(user.companies || "[]");
    if (!companies.includes(companySlug)) {
      companies.push(companySlug);
      await db.appUser.update({
        where: { email: accountantEmail },
        data: { companies: JSON.stringify(companies) },
      });
    }
  }

  logger.info("[accountant-collab] access granted", { companySlug, accountantEmail, accessLevel, roleName });

  return {
    id: 0, // no dedicated table — role permissions serve as the record
    companySlug,
    accountantEmail,
    accessLevel,
    permissionsGranted: permissions,
    createdAt: new Date(),
  };
}

// ─── 2. exportToAccountantExcel ───────────────────────────────────────────────

export async function exportToAccountantExcel(
  companySlug: string,
  periodFrom: string,
  periodTo: string,
  exportType: ExportType,
): Promise<ExportResult> {
  const company = await db.company.findUnique({
    where: { slug: companySlug },
    select: { name: true, nameAr: true, currency: true },
  });
  if (!company) throw new Error("Company not found");

  const fileNameSuffix = `${companySlug}_${periodFrom}_${periodTo}_${exportType}`;

  if (exportType === "trial_balance" || exportType === "full_package") {
    const tbData = await generateTrialBalanceData(companySlug, periodFrom, periodTo, company);
    if (exportType === "trial_balance") {
      return { fileName: `ميزان_مراجعة_${fileNameSuffix}.xlsx`, data: tbData };
    }
    // full_package includes all — we'll accumulate
    const allData: Record<string, unknown> = { trialBalance: tbData };

    const glData = await generateGeneralLedgerData(companySlug, periodFrom, periodTo, company);
    allData.generalLedger = glData;

    const jeData = await generateJournalEntriesData(companySlug, periodFrom, periodTo, company);
    allData.journalEntries = jeData;

    return { fileName: `حزمة_كاملة_${fileNameSuffix}.xlsx`, data: allData };
  }

  if (exportType === "general_ledger") {
    const glData = await generateGeneralLedgerData(companySlug, periodFrom, periodTo, company);
    return { fileName: `دفتر_الأستاذ_${fileNameSuffix}.xlsx`, data: glData };
  }

  if (exportType === "journal_entries") {
    const jeData = await generateJournalEntriesData(companySlug, periodFrom, periodTo, company);
    return { fileName: `قيود_يومية_${fileNameSuffix}.xlsx`, data: jeData };
  }

  throw new Error(`Unknown export type: ${exportType}`);
}

async function generateTrialBalanceData(
  companySlug: string,
  periodFrom: string,
  periodTo: string,
  company: { name: string; nameAr: string | null; currency: string },
): Promise<Record<string, unknown>> {
  const accounts = await db.account.findMany({
    where: { companySlug, isActive: true },
    include: {
      journalEntryLines: {
        include: { entry: { select: { status: true, date: true } } },
      },
    },
    orderBy: { code: "asc" },
  });

  const rows: Record<string, unknown>[] = [];
  let grandDebit = 0;
  let grandCredit = 0;

  for (const acc of accounts) {
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of acc.journalEntryLines) {
      if (line.entry.status !== "posted" && line.entry.status !== "reversed") continue;
      if (line.entry.date < periodFrom || line.entry.date > periodTo) continue;
      const multiplier = line.entry.status === "reversed" ? -1 : 1;
      totalDebit += num(line.debit, 3) * multiplier;
      totalCredit += num(line.credit, 3) * multiplier;
    }
    grandDebit += totalDebit;
    grandCredit += totalCredit;

    rows.push({
      "رمز الحساب": acc.code,
      "اسم الحساب": acc.nameAr,
      "نوع الحساب": acc.type,
      "مدين": num(totalDebit, 3).toFixed(3),
      "دائن": num(totalCredit, 3).toFixed(3),
      "الرصيد": num(totalDebit - totalCredit, 3).toFixed(3),
    });
  }

  return {
    headers: ["رمز الحساب", "اسم الحساب", "نوع الحساب", "مدين", "دائن", "الرصيد"],
    companyName: company.nameAr || company.name,
    currency: company.currency,
    periodFrom,
    periodTo,
    title: "ميزان المراجعة",
    rows,
    totals: {
      "مدين": num(grandDebit, 3).toFixed(3),
      "دائن": num(grandCredit, 3).toFixed(3),
      "الرصيد": num(grandDebit - grandCredit, 3).toFixed(3),
    },
  };
}

async function generateGeneralLedgerData(
  companySlug: string,
  periodFrom: string,
  periodTo: string,
  company: { name: string; nameAr: string | null; currency: string },
): Promise<Record<string, unknown>> {
  const accounts = await db.account.findMany({
    where: { companySlug, isActive: true },
    orderBy: { code: "asc" },
  });

  const ledgerEntries: Record<string, unknown>[] = [];
  for (const acc of accounts) {
    const lines = await db.journalEntryLine.findMany({
      where: {
        accountId: acc.id,
        entry: {
          companySlug,
          status: { in: ["posted", "reversed"] },
          date: { gte: periodFrom, lte: periodTo },
        },
      },
      include: { entry: { select: { date: true, description: true, reference: true, status: true } } },
      orderBy: { entry: { date: "asc" } },
    });

    let runningBalance = 0;
    const isDebitNormal = acc.type === "asset" || acc.type === "expense";

    for (const line of lines) {
      const multiplier = line.entry.status === "reversed" ? -1 : 1;
      const debit = num(line.debit, 3) * multiplier;
      const credit = num(line.credit, 3) * multiplier;
      runningBalance += isDebitNormal ? debit - credit : credit - debit;

      ledgerEntries.push({
        "رمز الحساب": acc.code,
        "اسم الحساب": acc.nameAr,
        "التاريخ": line.entry.date,
        "المرجع": line.entry.reference || "",
        "البيان": line.entry.description || "",
        "مدين": debit.toFixed(3),
        "دائن": credit.toFixed(3),
        "الرصيد": num(runningBalance, 3).toFixed(3),
      });
    }
  }

  return {
    headers: ["رمز الحساب", "اسم الحساب", "التاريخ", "المرجع", "البيان", "مدين", "دائن", "الرصيد"],
    companyName: company.nameAr || company.name,
    currency: company.currency,
    periodFrom,
    periodTo,
    title: "دفتر الأستاذ العام",
    rows: ledgerEntries,
  };
}

async function generateJournalEntriesData(
  companySlug: string,
  periodFrom: string,
  periodTo: string,
  company: { name: string; nameAr: string | null; currency: string },
): Promise<Record<string, unknown>> {
  const entries = await db.journalEntry.findMany({
    where: {
      companySlug,
      date: { gte: periodFrom, lte: periodTo },
      status: { in: ["posted", "reversed", "draft"] },
    },
    include: { lines: { include: { account: { select: { code: true, nameAr: true } } } } },
    orderBy: { date: "asc" },
  });

  const rows: Record<string, unknown>[] = [];
  for (const entry of entries) {
    for (const line of entry.lines) {
      rows.push({
        "رقم القيد": entry.id,
        "التاريخ": entry.date,
        "البيان": entry.description || "",
        "المرجع": entry.reference || "",
        "الحالة": entry.status,
        "رمز الحساب": line.account.code,
        "اسم الحساب": line.account.nameAr,
        "مدين": num(line.debit, 3).toFixed(3),
        "دائن": num(line.credit, 3).toFixed(3),
        "وصف السطر": line.description || "",
      });
    }
  }

  return {
    headers: [
      "رقم القيد", "التاريخ", "البيان", "المرجع", "الحالة",
      "رمز الحساب", "اسم الحساب", "مدين", "دائن", "وصف السطر",
    ],
    companyName: company.nameAr || company.name,
    currency: company.currency,
    periodFrom,
    periodTo,
    title: "قيود اليومية",
    rows,
  };
}

// ─── 3. logAccountingChange ───────────────────────────────────────────────────

export async function logAccountingChange(
  companySlug: string,
  userEmail: string,
  action: string,
  entity: string,
  entityId: number | null | undefined,
  beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown> | null,
  reason: string | null,
): Promise<{ id: number; companySlug: string; userEmail: string; action: string; entity: string; entityId: number | null; createdAt: Date }> {
  const entry = await db.accountingAuditLog.create({
    data: {
      companySlug,
      userEmail,
      action,
      entity,
      entityId: entityId ?? null,
      beforeState: beforeState ? JSON.stringify(beforeState) : null,
      afterState: afterState ? JSON.stringify(afterState) : null,
      reason,
    },
  });

  logger.info("[accounting-audit] change logged", { companySlug, userEmail, action, entity, entityId });

  return {
    id: entry.id,
    companySlug: entry.companySlug,
    userEmail: entry.userEmail,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    createdAt: entry.createdAt,
  };
}

// ─── 4. getAccountingAuditTrail ───────────────────────────────────────────────

export interface AuditTrailFilter {
  entity?: string;
  entityId?: number;
  fromDate?: string;
  toDate?: string;
}

export async function getAccountingAuditTrail(
  companySlug: string,
  filters?: AuditTrailFilter,
): Promise<Record<string, unknown>[]> {
  const where: Record<string, unknown> = { companySlug };

  if (filters?.entity) where.entity = filters.entity;
  if (filters?.entityId) where.entityId = filters.entityId;
  if (filters?.fromDate || filters?.toDate) {
    const dateFilter: Record<string, unknown> = {};
    if (filters.fromDate) dateFilter.gte = new Date(filters.fromDate);
    if (filters.toDate) dateFilter.lte = new Date(filters.toDate);
    where.createdAt = dateFilter;
  }

  const logs = await db.accountingAuditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return logs.map((log) => ({
    id: log.id,
    companySlug: log.companySlug,
    userEmail: log.userEmail,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    beforeState: log.beforeState ? JSON.parse(log.beforeState) : null,
    afterState: log.afterState ? JSON.parse(log.afterState) : null,
    reason: log.reason,
    createdAt: log.createdAt,
  }));
}
