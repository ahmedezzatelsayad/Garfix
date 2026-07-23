/**
 * ar-ap.ts — AR/AP operations module.
 *
 * Phase 2 (AR/AP operations) of the GarfiX ERP accounting module.
 * Provides:
 * - calculateAging: Aging report (30/60/90+ days)
 * - getClientStatement: Detailed client account statement
 * - getSupplierStatement: Detailed supplier account statement
 * - scheduleInstallments: Break one invoice into multiple payment dates
 *
 * ALL monetary values as String (no Float), use num() from money.ts.
 */
import { db } from "@/lib/db";
import { num, addNums, subNums, toNum } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────────

export type AgingDirection = "receivable" | "payable";

export interface AgingBucket {
  current: string;
  days30: string;
  days60: string;
  days90Plus: string;
  total: string;
}

export interface AgingItem {
  entityId: number;
  entityName: string;
  buckets: AgingBucket;
  details: {
    invoiceId: number;
    invoiceNumber: string;
    total: string;
    paid: string;
    outstanding: string;
    dueDate: string;
    daysPastDue: number;
  }[];
}

export interface AgingResult {
  direction: AgingDirection;
  companySlug: string;
  items: AgingItem[];
  summary: AgingBucket;
  asOfDate: string;
}

export interface ClientStatementLine {
  type: "invoice" | "payment" | "credit" | "adjustment";
  id: number;
  reference: string;
  date: string;
  description: string;
  debit: string; // amounts owed by client
  credit: string; // amounts paid by client
  balance: string; // running balance
}

export interface ClientStatementResult {
  companySlug: string;
  clientId: number;
  clientName: string;
  lines: ClientStatementLine[];
  summary: {
    totalInvoiced: string;
    totalPaid: string;
    outstandingBalance: string;
    openInvoices: number;
    overdueInvoices: number;
  };
}

export interface SupplierStatementLine {
  type: "purchase" | "payment" | "credit" | "adjustment";
  id: number;
  reference: string;
  date: string;
  description: string;
  debit: string; // amounts paid to supplier
  credit: string; // amounts owed to supplier
  balance: string; // running balance
}

export interface SupplierStatementResult {
  companySlug: string;
  supplierId: number;
  supplierName: string;
  lines: SupplierStatementLine[];
  summary: {
    totalPurchased: string;
    totalPaid: string;
    outstandingBalance: string;
    openPurchases: number;
    overduePurchases: number;
  };
}

export interface InstallmentScheduleResult {
  scheduleId: number;
  invoiceId: number;
  totalAmount: string;
  installmentCount: number;
  interval: string;
  startDate: string;
  installments: {
    installmentNumber: number;
    amount: string;
    dueDate: string;
    status: string;
  }[];
}

// ── Aging Report ────────────────────────────────────────────────────────────────

/**
 * calculateAging — Aging report (30/60/90+ days):
 * - For AR (receivable): Group unpaid invoices by client, bucket by days past due
 * - For AP (payable): Group unpaid purchase invoices by supplier, bucket by days past due
 * - Return: { current, 30days, 60days, 90daysPlus } per client/supplier
 */
export async function calculateAging(
  companySlug: string,
  direction: AgingDirection,
  asOfDate?: string | null,
): Promise<AgingResult> {
  const today = asOfDate || new Date().toISOString().slice(0, 10);
  const todayDate = new Date(today);

  const items: AgingItem[] = [];

  if (direction === "receivable") {
    // AR: unpaid invoices by client
    const invoices = await db.invoice.findMany({
      where: {
        companySlug,
        status: { in: ["sent", "partial", "overdue"] },
        deletedAt: null,
      },
      include: { client: true },
      orderBy: { dueDate: "asc" },
    });

    // Group by client
    const clientMap = new Map<number, typeof invoices>();
    for (const inv of invoices) {
      const clientId = inv.clientId || 0;
      const existing = clientMap.get(clientId) || [];
      existing.push(inv);
      clientMap.set(clientId, existing);
    }

    for (const [clientId, clientInvoices] of clientMap) {
      const clientName = clientInvoices[0]?.client?.name || clientInvoices[0]?.clientName || "Unknown";

      let current = 0;
      let days30 = 0;
      let days60 = 0;
      let days90Plus = 0;
      let total = 0;

      const details: AgingItem["details"] = [];

      for (const inv of clientInvoices) {
        const outstanding = num(num(inv.total, 3) - num(inv.paid, 3), 3);
        if (outstanding <= 0.001) continue; // fully paid, skip

        const dueDate = new Date(inv.dueDate);
        const daysPastDue = Math.max(0, Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

        total += outstanding;

        if (daysPastDue <= 0) {
          current += outstanding;
        } else if (daysPastDue <= 30) {
          days30 += outstanding;
        } else if (daysPastDue <= 60) {
          days60 += outstanding;
        } else {
          days90Plus += outstanding;
        }

        details.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          total: num(inv.total, 3).toFixed(3),
          paid: num(inv.paid, 3).toFixed(3),
          outstanding: outstanding.toFixed(3),
          dueDate: inv.dueDate,
          daysPastDue,
        });
      }

      if (total > 0.001) {
        items.push({
          entityId: clientId,
          entityName: clientName,
          buckets: {
            current: num(current, 3).toFixed(3),
            days30: num(days30, 3).toFixed(3),
            days60: num(days60, 3).toFixed(3),
            days90Plus: num(days90Plus, 3).toFixed(3),
            total: num(total, 3).toFixed(3),
          },
          details,
        });
      }
    }
  } else {
    // AP: unpaid purchase invoices by supplier
    const purchases = await db.purchaseInvoice.findMany({
      where: {
        companySlug,
        deletedAt: null,
      },
      include: { supplierEntity: true },
      orderBy: { date: "asc" },
    });

    // Group by supplier
    const supplierMap = new Map<number, typeof purchases>();
    for (const pi of purchases) {
      const supplierId = pi.supplierId || 0;
      const existing = supplierMap.get(supplierId) || [];
      existing.push(pi);
      supplierMap.set(supplierId, existing);
    }

    for (const [supplierId, supplierPurchases] of supplierMap) {
      const supplierName = supplierPurchases[0]?.supplierEntity?.name || supplierPurchases[0]?.supplier || "Unknown";

      let current = 0;
      let days30 = 0;
      let days60 = 0;
      let days90Plus = 0;
      let total = 0;

      const details: AgingItem["details"] = [];

      for (const pi of supplierPurchases) {
        const outstanding = num(pi.totalAmount, 3); // purchases don't have a "paid" field in current schema
        if (outstanding <= 0.001) continue;

        // Use purchase date as basis (no dueDate field in PurchaseInvoice model)
        const purchaseDate = new Date(pi.date);
        // Assume 30-day payment terms for aging
        const effectiveDueDate = new Date(purchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        const daysPastDue = Math.max(0, Math.floor((todayDate.getTime() - effectiveDueDate.getTime()) / (1000 * 60 * 60 * 24)));

        total += outstanding;

        if (daysPastDue <= 0) {
          current += outstanding;
        } else if (daysPastDue <= 30) {
          days30 += outstanding;
        } else if (daysPastDue <= 60) {
          days60 += outstanding;
        } else {
          days90Plus += outstanding;
        }

        details.push({
          invoiceId: pi.id,
          invoiceNumber: pi.num,
          total: num(pi.totalAmount, 3).toFixed(3),
          paid: num(0, 3).toFixed(3), // no paid field in PurchaseInvoice
          outstanding: outstanding.toFixed(3),
          dueDate: effectiveDueDate.toISOString().slice(0, 10),
          daysPastDue,
        });
      }

      if (total > 0.001) {
        items.push({
          entityId: supplierId,
          entityName: supplierName,
          buckets: {
            current: num(current, 3).toFixed(3),
            days30: num(days30, 3).toFixed(3),
            days60: num(days60, 3).toFixed(3),
            days90Plus: num(days90Plus, 3).toFixed(3),
            total: num(total, 3).toFixed(3),
          },
          details,
        });
      }
    }
  }

  // Calculate summary
  const summary: AgingBucket = {
    current: num(items.reduce((s, i) => s + num(i.buckets.current, 3), 0), 3).toFixed(3),
    days30: num(items.reduce((s, i) => s + num(i.buckets.days30, 3), 0), 3).toFixed(3),
    days60: num(items.reduce((s, i) => s + num(i.buckets.days60, 3), 0), 3).toFixed(3),
    days90Plus: num(items.reduce((s, i) => s + num(i.buckets.days90Plus, 3), 0), 3).toFixed(3),
    total: num(items.reduce((s, i) => s + num(i.buckets.total, 3), 0), 3).toFixed(3),
  };

  return {
    direction,
    companySlug,
    items,
    summary,
    asOfDate: today,
  };
}

// ── Client Statement ────────────────────────────────────────────────────────────

/**
 * getClientStatement — Detailed client account statement:
 * - All invoices + payments for a client
 * - Running balance
 * - Summary totals
 */
export async function getClientStatement(
  companySlug: string,
  clientId: number,
): Promise<ClientStatementResult> {
  const client = await db.client.findFirst({
    where: { id: clientId, companySlug, deletedAt: null },
  });
  if (!client) {
    throw new Error(`Client ${clientId} not found for company "${companySlug}"`);
  }

  // Get all invoices for this client
  const invoices = await db.invoice.findMany({
    where: {
      companySlug,
      clientId,
      deletedAt: null,
    },
    orderBy: { issueDate: "asc" },
  });

  // Get payment vouchers (receipts) for this client
  const payments = await db.paymentVoucher.findMany({
    where: {
      companySlug,
      clientId,
      voucherType: "receipt",
      // FIX #8: PaymentVoucher does NOT have `deletedAt` — removed from where clause.
      // Use status filter to exclude cancelled vouchers instead.
      status: { not: "cancelled" },
    },
    orderBy: { date: "asc" },
  });

  // Build combined timeline sorted by date
  const lines: ClientStatementLine[] = [];
  let runningBalance = 0;

  // Add invoices (debit — amounts owed by client)
  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    const total = num(inv.total, 3);
    runningBalance += total;
    lines.push({
      type: "invoice",
      id: inv.id,
      reference: inv.invoiceNumber,
      date: inv.issueDate,
      description: `Invoice ${inv.invoiceNumber}`,
      debit: total.toFixed(3),
      credit: num(0, 3).toFixed(3),
      balance: num(runningBalance, 3).toFixed(3),
    });
  }

  // Add payments (credit — amounts paid by client)
  for (const pay of payments) {
    const amount = num(pay.amount, 3);
    runningBalance -= amount;
    lines.push({
      type: "payment",
      id: pay.id,
      reference: pay.voucherNumber,
      date: pay.date,
      description: `Payment ${pay.voucherNumber}`,
      debit: num(0, 3).toFixed(3),
      credit: amount.toFixed(3),
      balance: num(runningBalance, 3).toFixed(3),
    });
  }

  // Sort by date
  lines.sort((a, b) => a.date.localeCompare(b.date));

  // Recalculate running balance after sort
  let recalculatedBalance = 0;
  for (const line of lines) {
    recalculatedBalance += num(line.debit, 3) - num(line.credit, 3);
    line.balance = num(recalculatedBalance, 3).toFixed(3);
  }

  // Summary
  const totalInvoiced = lines.filter((l) => l.type === "invoice").reduce((s, l) => s + num(l.debit, 3), 0);
  const totalPaid = lines.filter((l) => l.type === "payment").reduce((s, l) => s + num(l.credit, 3), 0);
  const outstandingBalance = num(totalInvoiced - totalPaid, 3);

  const openInvoices = invoices.filter((inv) => inv.status !== "paid" && inv.status !== "cancelled").length;
  const overdueInvoices = invoices.filter((inv) => inv.status === "overdue").length;

  return {
    companySlug,
    clientId,
    clientName: client.name,
    lines,
    summary: {
      totalInvoiced: num(totalInvoiced, 3).toFixed(3),
      totalPaid: num(totalPaid, 3).toFixed(3),
      outstandingBalance: outstandingBalance.toFixed(3),
      openInvoices,
      overdueInvoices,
    },
  };
}

// ── Supplier Statement ────────────────────────────────────────────────────────────

/**
 * getSupplierStatement — Detailed supplier account statement:
 * - All purchase invoices + payments for a supplier
 * - Running balance
 * - Summary totals
 */
export async function getSupplierStatement(
  companySlug: string,
  supplierId: number,
): Promise<SupplierStatementResult> {
  const supplier = await db.supplier.findFirst({
    where: { id: supplierId, companySlug, deletedAt: null },
  });
  if (!supplier) {
    throw new Error(`Supplier ${supplierId} not found for company "${companySlug}"`);
  }

  // Get all purchase invoices for this supplier
  const purchases = await db.purchaseInvoice.findMany({
    where: {
      companySlug,
      supplierId,
      deletedAt: null,
    },
    orderBy: { date: "asc" },
  });

  // Get payment vouchers (payments) for this supplier
  const payments = await db.paymentVoucher.findMany({
    where: {
      companySlug,
      supplierId,
      voucherType: "payment",
      // FIX #8: PaymentVoucher does NOT have `deletedAt` — removed from where clause.
      status: { not: "cancelled" },
    },
    orderBy: { date: "asc" },
  });

  // Build combined timeline sorted by date
  const lines: SupplierStatementLine[] = [];
  let runningBalance = 0;

  // Add purchases (credit — amounts owed to supplier)
  for (const pi of purchases) {
    const total = num(pi.totalAmount, 3);
    runningBalance += total;
    lines.push({
      type: "purchase",
      id: pi.id,
      reference: pi.num,
      date: pi.date,
      description: `Purchase Invoice ${pi.num}`,
      debit: num(0, 3).toFixed(3),
      credit: total.toFixed(3),
      balance: num(runningBalance, 3).toFixed(3),
    });
  }

  // Add payments (debit — amounts paid to supplier)
  for (const pay of payments) {
    const amount = num(pay.amount, 3);
    runningBalance -= amount;
    lines.push({
      type: "payment",
      id: pay.id,
      reference: pay.voucherNumber,
      date: pay.date,
      description: `Payment ${pay.voucherNumber}`,
      debit: amount.toFixed(3),
      credit: num(0, 3).toFixed(3),
      balance: num(runningBalance, 3).toFixed(3),
    });
  }

  // Sort by date
  lines.sort((a, b) => a.date.localeCompare(b.date));

  // Recalculate running balance after sort
  let recalculatedBalance = 0;
  for (const line of lines) {
    recalculatedBalance += num(line.credit, 3) - num(line.debit, 3);
    line.balance = num(recalculatedBalance, 3).toFixed(3);
  }

  // Summary
  const totalPurchased = lines.filter((l) => l.type === "purchase").reduce((s, l) => s + num(l.credit, 3), 0);
  const totalPaid = lines.filter((l) => l.type === "payment").reduce((s, l) => s + num(l.debit, 3), 0);
  const outstandingBalance = num(totalPurchased - totalPaid, 3);

  const openPurchases = purchases.length; // no "paid" status in PurchaseInvoice model
  const overduePurchases = 0; // no overdue concept in PurchaseInvoice

  return {
    companySlug,
    supplierId,
    supplierName: supplier.name,
    lines,
    summary: {
      totalPurchased: num(totalPurchased, 3).toFixed(3),
      totalPaid: num(totalPaid, 3).toFixed(3),
      outstandingBalance: outstandingBalance.toFixed(3),
      openPurchases,
      overduePurchases,
    },
  };
}

// ── Dashboard Aliases ────────────────────────────────────────────────────────────

/** Alias for dashboard route — AR summary via aging report (receivable direction). */
export async function getARSummary(companySlug: string) {
  return calculateAging(companySlug, "receivable");
}

/** Alias for dashboard route — AP summary via aging report (payable direction). */
export async function getAPSummary(companySlug: string) {
  return calculateAging(companySlug, "payable");
}

// ── Installment Scheduling ──────────────────────────────────────────────────────────

/**
 * scheduleInstallments — Break one invoice into multiple payment dates:
 * - Input: invoiceId, installmentCount, startDate, interval (monthly/weekly)
 * - Creates scheduled payment records (InstallmentSchedule + Installments)
 * - Each installment has a dueDate and amount
 */
export async function scheduleInstallments(
  companySlug: string,
  invoiceId: number,
  installmentCount: number,
  startDate: string,
  interval: "monthly" | "weekly",
  userEmail: string,
  userUid: string,
): Promise<InstallmentScheduleResult> {
  // Fetch the invoice
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, companySlug, deletedAt: null },
  });
  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found for company "${companySlug}"`);
  }

  const totalAmount = num(invoice.total, 3);
  const baseInstallment = num(totalAmount / installmentCount, 3);
  // Handle rounding: distribute remainder to last installment
  const remainder = num(totalAmount - baseInstallment * installmentCount, 3);

  const startDt = new Date(startDate);

  // Create the schedule and installments in a transaction
  const result = await db.$transaction(async (tx) => {
    const schedule = await tx.installmentSchedule.create({
      data: {
        companySlug,
        invoiceId,
        totalAmount: totalAmount.toFixed(3),
        installmentCount,
        interval,
        startDate,
        status: "active",
        createdBy: userEmail,
      },
    });

    // FIX #9: Explicitly type installmentData to match the Prisma Installment model schema.
    // Installment model: scheduleId (Int), installmentNumber (Int), amount (String),
    // dueDate (String YYYY-MM-DD), status (String). Without explicit typing,
    // TypeScript infers `never[]` from the empty array literal.
    const installmentData: Array<{
      scheduleId: number;
      installmentNumber: number;
      amount: string;
      dueDate: string;
      status: string;
    }> = [];
    for (let i = 0; i < installmentCount; i++) {
      const dueDate = new Date(startDt);
      if (interval === "monthly") {
        dueDate.setMonth(dueDate.getMonth() + i);
      } else {
        dueDate.setDate(dueDate.getDate() + i * 7);
      }

      const amount = i === installmentCount - 1
        ? num(baseInstallment + remainder, 3).toFixed(3) // last installment gets remainder
        : baseInstallment.toFixed(3);

      installmentData.push({
        scheduleId: schedule.id,
        installmentNumber: i + 1,
        amount,
        dueDate: dueDate.toISOString().slice(0, 10),
        status: "pending",
      });
    }

    await tx.installment.createMany({ data: installmentData });

    return schedule;
  });

  // Fetch the created installments
  const installments = await db.installment.findMany({
    where: { scheduleId: result.id },
    orderBy: { installmentNumber: "asc" },
  });

  await logAudit({
    userEmail,
    userUid,
    action: "create_installment_schedule",
    entity: "installment_schedule",
    entityId: result.id,
    companySlug,
    details: {
      invoiceId,
      installmentCount,
      interval,
      startDate,
      totalAmount: totalAmount.toFixed(3),
    },
  });

  return {
    scheduleId: result.id,
    invoiceId,
    totalAmount: totalAmount.toFixed(3),
    installmentCount,
    interval,
    startDate,
    installments: installments.map((inst) => ({
      installmentNumber: inst.installmentNumber,
      amount: inst.amount,
      dueDate: inst.dueDate,
      status: inst.status,
    })),
  };
}
