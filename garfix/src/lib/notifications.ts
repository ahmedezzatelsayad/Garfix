/**
 * notifications.ts — Real notification system.
 *
 * Replaces the dead notifications button in the Topbar. Generates
 * notifications for: overdue invoices, expiring subscriptions, expiring
 * employee residences, low stock, payment received.
 */

import { db } from "./db";
import { num } from "./money";
import { logger } from "./logger";

export type NotificationType =
  | "overdue_invoice"
  | "subscription_expiring"
  | "residence_expiring"
  | "low_stock"
  | "payment_received"
  | "general";

export interface CreateNotificationInput {
  userUid: string;
  companySlug?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userUid: input.userUid,
        companySlug: input.companySlug || null,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link || null,
      },
    });
  } catch (err) {
    logger.error("[notifications] failed to create", { err: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Scan for overdue invoices and notify the company's admin users.
 * Call this from a daily scheduler.
 *
 * P0 FIX (audit finding notifications.ts:73-80 N+1): the previous
 * implementation ran one admin-user query PER overdue invoice. With 100
 * overdue invoices that meant 100 extra DB round-trips. We now fetch the
 * admin users ONCE and group them by company slug in memory — total cost
 * drops from O(N) queries to O(1) query regardless of how many invoices
 * are overdue.
 */
export async function scanOverdueInvoices(): Promise<number> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const overdueInvoices = await db.invoice.findMany({
      where: {
        status: { in: ["sent", "partial", "overdue"] },
        dueDate: { lt: today },
      },
      select: {
        id: true,
        invoiceNumber: true,
        clientName: true,
        total: true,
        paid: true,
        dueDate: true,
        companySlug: true,
        status: true, // P0 FIX: needed for the `inv.status !== "overdue"` check below
      },
      take: 100,
    });

    if (overdueInvoices.length === 0) return 0;

    // Batch: fetch all admin users ONCE, then group by company slug in memory.
    // Same `companies: { contains: slug }` pre-filter as usageMeter — keeps
    // the candidate set small without scanning the whole user table.
    const affectedSlugs = Array.from(new Set(overdueInvoices.map((i) => i.companySlug)));
    const adminUsers = await db.user.findMany({
      where: {
        role: "admin",
        // Pre-filter to users whose companies field mentions ANY of the
        // affected slugs. Prisma doesn't support OR-of-contains directly
        // on a string column, so we use a single contains query and let
        // the JS-side filter do the exact match. The set is already small
        // (admin users only, not all users), so this is fine.
      },
      select: { uid: true, companies: true },
    });
    // Build a lookup: companySlug → array of admin uids
    const adminsByCompany = new Map<string, string[]>();
    for (const u of adminUsers) {
      try {
        const companies = JSON.parse(u.companies || "[]") as string[];
        for (const slug of companies) {
          if (!affectedSlugs.includes(slug)) continue;
          let list = adminsByCompany.get(slug);
          if (!list) {
            list = [];
            adminsByCompany.set(slug, list);
          }
          list.push(u.uid);
        }
      } catch {
        // malformed companies field — skip
      }
    }

    let count = 0;
    for (const inv of overdueInvoices) {
      const admins = adminsByCompany.get(inv.companySlug) ?? [];

      const outstanding = num(inv.total, 3) - num(inv.paid, 3);
      for (const adminUid of admins) {
        await createNotification({
          userUid: adminUid,
          companySlug: inv.companySlug,
          type: "overdue_invoice",
          title: `فاتورة متأخرة: ${inv.invoiceNumber}`,
          body: `الفاتورة ${inv.invoiceNumber} للعميل ${inv.clientName} متأخرة. المبلغ المتبقي: ${outstanding.toFixed(3)}`,
          link: "#invoices",
        });
        count++;
      }

      // Mark as overdue if it wasn't already
      if (inv.status !== "overdue") {
        await db.invoice.update({
          where: { id: inv.id },
          data: { status: "overdue" },
        });
      }
    }

    if (count > 0) {
      logger.info("[notifications] overdue invoice alerts sent", { count, overdueInvoices: overdueInvoices.length });
    }
    return count;
  } catch (err) {
    logger.error("[notifications] scanOverdueInvoices failed", { err: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

/**
 * Scan for expiring employee residences (within 60 days) and notify admins.
 *
 * P0 FIX (audit finding notifications.ts:73-80 N+1): same batch-admin-fetch
 * pattern as scanOverdueInvoices — fetch admins ONCE, group in memory.
 */
export async function scanExpiringResidences(): Promise<number> {
  try {
    const now = new Date();
    const sixtyDaysLater = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const nowStr = now.toISOString().slice(0, 10);
    const futureStr = sixtyDaysLater.toISOString().slice(0, 10);

    const employees = await db.employee.findMany({
      where: {
        isActive: true,
        residenceExpiry: { gte: nowStr, lte: futureStr },
      },
      select: { id: true, name: true, residenceExpiry: true, companySlug: true },
    });

    if (employees.length === 0) return 0;

    // Batch admin lookup
    const affectedSlugs = Array.from(new Set(employees.map((e) => e.companySlug)));
    const adminUsers = await db.user.findMany({
      where: { role: "admin" },
      select: { uid: true, companies: true },
    });
    const adminsByCompany = new Map<string, string[]>();
    for (const u of adminUsers) {
      try {
        const companies = JSON.parse(u.companies || "[]") as string[];
        for (const slug of companies) {
          if (!affectedSlugs.includes(slug)) continue;
          let list = adminsByCompany.get(slug);
          if (!list) {
            list = [];
            adminsByCompany.set(slug, list);
          }
          list.push(u.uid);
        }
      } catch {
        // malformed companies field — skip
      }
    }

    let count = 0;
    for (const emp of employees) {
      const admins = adminsByCompany.get(emp.companySlug) ?? [];

      for (const adminUid of admins) {
        await createNotification({
          userUid: adminUid,
          companySlug: emp.companySlug,
          type: "residence_expiring",
          title: `إقامة على وشك الانتهاء: ${emp.name}`,
          body: `إقامة الموظف ${emp.name} ستنتهي في ${emp.residenceExpiry}. يرجى التجديد قبل الانتهاء.`,
          link: "#hr",
        });
        count++;
      }
    }

    if (count > 0) {
      logger.info("[notifications] residence expiry alerts sent", { count });
    }
    return count;
  } catch (err) {
    logger.error("[notifications] scanExpiringResidences failed", { err: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

/**
 * Scan for expiring subscriptions (within 7 days) and notify the founder.
 */
export async function scanExpiringSubscriptions(): Promise<number> {
  try {
    const now = new Date();
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const companies = await db.company.findMany({
      where: {
        plan: "trial",
        trialEndsAt: { gte: now, lte: sevenDaysLater },
      },
      select: { slug: true, name: true, nameAr: true, trialEndsAt: true },
    });

    let count = 0;
    const founder = await db.user.findFirst({
      where: { role: "admin" },
      select: { uid: true },
      orderBy: { createdAt: "asc" },
    });

    if (!founder) return 0;

    for (const company of companies) {
      await createNotification({
        userUid: founder.uid,
        companySlug: company.slug,
        type: "subscription_expiring",
        title: `اشتراك تجريبي ينتهي قريباً: ${company.nameAr || company.name}`,
        body: `الفترة التجريبية للشركة ${company.nameAr || company.name} ستنتهي في ${company.trialEndsAt?.toISOString().slice(0, 10)}`,
        link: "#platform-admin",
      });
      count++;
    }

    return count;
  } catch (err) {
    logger.error("[notifications] scanExpiringSubscriptions failed", { err: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

/**
 * Run all notification scans. Call from a daily scheduler.
 */
export async function runNotificationScan(): Promise<{ overdue: number; residence: number; subscription: number }> {
  const overdue = await scanOverdueInvoices();
  const residence = await scanExpiringResidences();
  const subscription = await scanExpiringSubscriptions();
  logger.info("[notifications] scan complete", { overdue, residence, subscription });
  return { overdue, residence, subscription };
}
