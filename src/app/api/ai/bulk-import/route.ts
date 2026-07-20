/**
 * POST /api/ai/bulk-import
 *
 * Save an array of parsed orders as real invoices in a single transaction.
 * Optionally creates corresponding journal entries (S-01 from ERP audit —
 * invoices now produce accounting side-effects when an Accounts Receivable
 * + Sales Revenue account pair exists for the company).
 *
 * Body: {
 *   companySlug: string,
 *   orders: ParsedOrder[],
 *   createJournalEntries?: boolean (default: false),
 * }
 * Returns: { created: Invoice[], errors: Array<{ order, error }> }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { requirePermissionForCompany } from "@/lib/middleware";
import { calcInvoiceTotals, num } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { syncInventoryOnSale } from "@/lib/inventorySync";
import { checkTrialExpiry, checkInvoiceQuota } from "@/lib/usageMeter";

const ItemSchema = z.object({
  name: z.string().min(1),
  qty: z.union([z.number(), z.string()]),
  unitPrice: z.union([z.number(), z.string()]),
});

const OrderSchema = z.object({
  clientName: z.string().min(1, "اسم العميل مطلوب"),
  clientPhone: z.string().optional().default(""),
  clientAddress: z.string().optional().default(""),
  clientEmail: z.string().email().optional().or(z.literal("")).default(""),
  items: z.array(ItemSchema).min(1, "كل فاتورة تحتاج عنصراً واحداً على الأقل"),
  taxRate: z.union([z.number(), z.string()]).optional().default(0),
  shipping: z.union([z.number(), z.string()]).optional().default(0),
  discount: z.union([z.number(), z.string()]).optional().default(0),
  notes: z.string().optional().default(""),
});

const RequestSchema = z.object({
  companySlug: z.string().min(1, "companySlug مطلوب"),
  orders: z.array(OrderSchema).min(1, "أرسل طلباً واحداً على الأقل"),
  createJournalEntries: z.boolean().optional().default(false),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "مدخلات غير صالحة", 400);
  }
  const { companySlug, orders, createJournalEntries } = parsed.data;

  // Enforce permission (create_invoice) + company access
  const access = await requirePermissionForCompany(req, "create_invoice", companySlug);
  if ("error" in access) return access.error;
  const user = access.user;

  // Fetch the company for currency + default tax rate
  const company = await db.company.findUnique({ where: { slug: companySlug } });
  if (!company) return apiError("الشركة غير موجودة", 404);

  // Quota enforcement (gap fix): bulk-import previously bypassed trial-expiry
  // and invoice-quota checks entirely. A bulk import of 1000 orders on a
  // trial tenant would sail through. Now enforced here, same as the single
  // invoice POST path (see /api/invoices/route.ts).
  const trialCheck = await checkTrialExpiry(companySlug);
  if (!trialCheck.ok) {
    return NextResponse.json(
      { error: trialCheck.reason, code: "TRIAL_EXPIRED" },
      { status: 402 },
    );
  }
  const quotaCheck = await checkInvoiceQuota(companySlug);
  if (!quotaCheck.ok) {
    return NextResponse.json(
      {
        error: `تجاوزت حد الفواتير الشهرية (${quotaCheck.limit}). الفواتير الحالية: ${quotaCheck.current}، تحاول إضافة: ${orders.length}.`,
        code: "QUOTA_EXCEEDED",
        limit: quotaCheck.limit,
        current: quotaCheck.current,
      },
      { status: 402 },
    );
  }

  // Optional: fetch AR + Sales accounts for journal entries
  let arAccount: { id: number } | null = null;
  let salesAccount: { id: number } | null = null;
  let taxAccount: { id: number } | null = null;
  if (createJournalEntries) {
    const accounts = await db.account.findMany({
      where: { companySlug, isActive: true },
      select: { id: true, code: true, type: true },
    });
    // Find by convention: AR = type='asset' AND code starts with '11', Sales = type='revenue', Tax = type='liability' code starts with '2'
    arAccount = accounts.find((a) => a.type === "asset" && a.code.startsWith("11")) || null;
    salesAccount = accounts.find((a) => a.type === "revenue") || null;
    taxAccount = accounts.find((a) => a.type === "liability" && a.code.startsWith("2")) || null;
    if (!arAccount || !salesAccount) {
      logger.warn("[bulk-import] journal entries requested but AR/Sales accounts not found — skipping JE", { companySlug, hasAR: !!arAccount, hasSales: !!salesAccount });
    }
  }

  const created: Array<Record<string, unknown>> = [];
  const errors: Array<{ index: number; error: string }> = [];
  let invCounter = 0;
  // Generate a unique invoice number base from current timestamp + count
  const baseInvNum = `INV-${Date.now().toString().slice(-6)}`;

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    try {
      invCounter++;
      const invoiceNumber = `${baseInvNum}-${invCounter}`;
      const items = order.items.map((it) => ({
        description: it.name,
        qty: num(it.qty),
        price: num(it.unitPrice, 3),
      }));
      const taxRate = order.taxRate !== undefined ? num(order.taxRate) : num(company.defaultTaxRate);
      const totals = calcInvoiceTotals(items, taxRate, num(order.shipping), num(order.discount));

      // Find or skip client matching (we don't create clients automatically — user can do it later)
      let clientId: number | null = null;
      if (order.clientPhone || order.clientEmail) {
        const existingClient = await db.client.findFirst({
          where: {
            companySlug,
            OR: [
              order.clientPhone ? { phone: order.clientPhone } : {},
              order.clientEmail ? { email: order.clientEmail } : {},
            ].filter((c) => Object.keys(c).length > 0),
          },
        });
        if (existingClient) clientId = existingClient.id;
      }

      const issueDate = new Date().toISOString().slice(0, 10);
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      // Use a transaction so the invoice + journal entry are atomic (DB-CRIT-03)
      const invoice = await db.$transaction(async (tx) => {
        const inv = await tx.invoice.create({
          data: {
            companySlug,
            invoiceNumber,
            clientId,
            clientName: order.clientName,
            clientEmail: order.clientEmail || null,
            clientPhone: order.clientPhone || null,
            clientAddress: order.clientAddress || null,
            issueDate,
            dueDate,
            status: "sent",
            lineItems: JSON.stringify(items),
            subtotal: totals.subtotal,
            taxRate: totals.taxRate,
            taxAmount: totals.taxAmount,
            total: totals.total,
            shipping: totals.shipping,
            discount: totals.discount,
            paid: "0",
            notes: order.notes || null,
            source: "ai-bulk-import",
            createdByEmail: user.email,
            createdByName: user.uid,
            version: 0,
          },
        });

        // Optional: create the journal entry (S-01 fix from ERP audit)
        if (createJournalEntries && arAccount && salesAccount && num(totals.total) > 0) {
          const je = await tx.journalEntry.create({
            data: {
              companySlug,
              date: issueDate,
              description: `فاتورة مبيعات ${invoiceNumber} — ${order.clientName}`,
              reference: invoiceNumber,
              status: "posted",
              createdBy: user.email,
              sourceType: "invoice",
              sourceId: inv.id,
              lines: {
                create: [
                  // Debit AR (asset increases with debit)
                  {
                    accountId: arAccount.id,
                    debit: totals.total,
                    credit: "0",
                    description: `ذمم عملاء - ${invoiceNumber}`,
                  },
                  // Credit Sales Revenue (revenue increases with credit)
                  {
                    accountId: salesAccount.id,
                    debit: "0",
                    credit: totals.subtotal,
                    description: `إيراد مبيعات - ${invoiceNumber}`,
                  },
                  // Credit Tax Payable if there's tax
                  ...(taxAccount && num(totals.taxAmount) > 0 ? [{
                    accountId: taxAccount.id,
                    debit: "0",
                    credit: totals.taxAmount,
                    description: `ضريبة مستحقة - ${invoiceNumber}`,
                  }] : []),
                ],
              },
            },
          });

          // Update the invoice to link the journal entry
          await tx.invoice.update({
            where: { id: inv.id },
            data: { journalEntryId: je.id },
          });

          // Update account balances
          await tx.account.update({
            where: { id: arAccount.id },
            data: { balance: (num((await tx.account.findUnique({ where: { id: arAccount.id } }))?.balance || "0", 3) + num(totals.total, 3)).toFixed(3) },
          });
          await tx.account.update({
            where: { id: salesAccount.id },
            data: { balance: (num((await tx.account.findUnique({ where: { id: salesAccount.id } }))?.balance || "0", 3) + num(totals.subtotal, 3)).toFixed(3) },
          });
          if (taxAccount && num(totals.taxAmount) > 0) {
            await tx.account.update({
              where: { id: taxAccount.id },
              data: { balance: (num((await tx.account.findUnique({ where: { id: taxAccount.id } }))?.balance || "0", 3) + num(totals.taxAmount, 3)).toFixed(3) },
            });
          }
        }

        return inv;
      });

      created.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        total: num(invoice.total, 3),
        status: invoice.status,
      });

      // Sync inventory (Task 24: oversell blocking + StockMovement ledger)
      const syncResult = await db.$transaction(async (tx) => {
        return await syncInventoryOnSale(tx, companySlug, items, invoice.id);
      });
      const syncWarnings = syncResult.warnings || [];
      (created[created.length - 1] as any).warnings = syncWarnings;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[bulk-import] order failed", { err: msg, index: i, order: order.clientName });
      errors.push({ index: i, error: msg });
    }
  }

  // Aggregate [REVIEW-QUEUE] + [OVERSELL] warnings for UI banner
  const reviewQueueWarnings: string[] = [];
  for (const c of created) {
    const w = (c as any).warnings as string[] | undefined;
    if (w && w.length > 0) {
      reviewQueueWarnings.push(...w.filter((x) => x.startsWith("[REVIEW-QUEUE]") || x.startsWith("[OVERSELL]")));
    }
  }

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "ai_bulk_import",
    entity: "invoice",
    companySlug,
    details: {
      totalOrders: orders.length,
      created: created.length,
      errors: errors.length,
      withJournalEntries: createJournalEntries && !!arAccount && !!salesAccount,
      reviewQueueWarnings: reviewQueueWarnings.length,
    },
  });

  return NextResponse.json({
    ok: true,
    created,
    errors,
    reviewQueueWarnings,
    meta: {
      totalOrders: orders.length,
      createdCount: created.length,
      errorCount: errors.length,
      reviewQueueWarningCount: reviewQueueWarnings.length,
    },
  });
});
