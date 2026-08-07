/**
 * notifications.ts — Rejection notification dispatcher for e-invoicing webhooks.
 *
 * When a webhook receipt has status=rejected, we notify the company admin via:
 *   1. In-app Notification (always — fallback channel)
 *   2. Email via SendGrid (if configured + company has email)
 *   3. WhatsApp via WhatsApp Cloud API (if configured + company has phone)
 *
 * Throttling: max 1 notification per (companySlug, externalUuid) per hour.
 * This prevents spam if an authority sends 10 rejection webhooks for the
 * same invoice in quick succession.
 *
 * RUNTIME: Node.js only — uses fetch, logger, db, integration providers
 */
'use node';

import { dbTyped as db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getIntegrationConfig } from "@/lib/integrations/registry";
import { sendgridProvider } from "@/lib/integrations/sendgrid";
import { whatsappProvider } from "@/lib/integrations/whatsapp";

// ─── Types ────────────────────────────────────────────────────────────────

export interface RejectionNotificationInput {
  companySlug: string;
  invoiceId: number | null;
  externalUuid: string | null;
  authority: string;
  rejectionReason: string | null;
  receiptId: string;
}

export interface NotificationResult {
  inApp: { sent: boolean; notificationId?: number; error?: string };
  email: { sent: boolean; messageId?: string; error?: string; skipped?: boolean };
  whatsapp: { sent: boolean; error?: string; skipped?: boolean };
  throttled: boolean;
  skipped?: boolean; // FIX #23 (MEDIUM): distinguish "skipped" from "throttled"
}

// ─── Throttling ───────────────────────────────────────────────────────────

const THROTTLE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check if a notification was already sent for this (companySlug, externalUuid)
 * within the throttle window. Uses the in-app Notification table as the source
 * of truth — if a row with type='e_invoice_rejected' and body containing the
 * externalUuid exists in the last hour, we skip.
 *
 * FIX #13 (HIGH): also throttle by invoiceId when available — some authorities
 * send different UUIDs for the same invoice on re-submission, so UUID-only
 * throttle would let duplicates through.
 */
async function isThrottled(
  companySlug: string,
  externalUuid: string | null,
  invoiceId?: number | null,
): Promise<boolean> {
  if (!externalUuid && !invoiceId) return false;
  try {
    const oneHourAgo = new Date(Date.now() - THROTTLE_WINDOW_MS);
    // Look for any rejection notification in the last hour that mentions this UUID
    // or the invoiceId
    const conditions: Record<string, unknown>[] = [];
    if (externalUuid) {
      conditions.push({ body: { contains: externalUuid } });
    }
    if (invoiceId) {
      conditions.push({ body: { contains: `#${invoiceId}` } });
    }
    const recent = await db.notification.findFirst({
      where: {
        companySlug,
        type: "e_invoice_rejected",
        createdAt: { gte: oneHourAgo },
        OR: conditions,
      },
      select: { id: true },
    });
    return !!recent;
  } catch (err) {
    // If the query fails (e.g. table schema drift), don't block the notification
    logger.warn("[e-invoicing:notifications] throttle check failed", {
      companySlug, externalUuid, invoiceId,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ─── Admin lookup ─────────────────────────────────────────────────────────

/**
 * Find admin users for a company. We look up AppUser rows whose `companies`
 * JSON array includes the slug AND whose role is 'admin' or 'owner'.
 *
 * Returns at most 5 admin user uids (to avoid notifying 100 people).
 */
async function findCompanyAdmins(companySlug: string): Promise<Array<{ uid: string; email: string; displayName: string }>> {
  try {
    // The `companies` field is a JSON array stored as a string. We filter in JS
    // because Prisma can't query inside JSON arrays portably.
    const candidates = await db.appUser.findMany({
      where: {
        role: { in: ["admin", "owner", "founder"] },
      },
      select: { uid: true, email: true, displayName: true, companies: true },
      take: 200, // scan at most 200 admins
    });
    const admins = candidates
      .filter((u) => {
        try {
          // FIX #30 (LOW): validate parsed data is actually string[]
          const parsed = JSON.parse(u.companies || "[]");
          const slugs = Array.isArray(parsed)
            ? parsed.filter((s): s is string => typeof s === "string")
            : [];
          return slugs.includes(companySlug);
        } catch {
          return false;
        }
      })
      .slice(0, 5)
      .map(({ uid, email, displayName }) => ({ uid, email, displayName }));
    return admins;
  } catch (err) {
    logger.warn("[e-invoicing:notifications] admin lookup failed", {
      companySlug,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ─── Company contact lookup ───────────────────────────────────────────────

async function getCompanyContact(companySlug: string): Promise<{ phone: string | null; name: string | null }> {
  try {
    const company = await db.company.findUnique({
      where: { slug: companySlug },
      select: { phone: true, name: true, nameAr: true },
    });
    return {
      phone: company?.phone || null,
      name: company?.nameAr || company?.name || null,
    };
  } catch {
    return { phone: null, name: null };
  }
}

// ─── Notification content (Arabic) ────────────────────────────────────────

function buildNotificationContent(input: RejectionNotificationInput, companyName: string | null): {
  title: string;
  body: string;
  emailSubject: string;
  emailText: string;
  whatsappText: string;
} {
  const authorityLabels: Record<string, string> = {
    zatca: "ZATCA (السعودية)",
    eta_egypt: "ETA (مصر)",
    uae_fta: "FTA (الإمارات)",
    kuwait_decree_10_2026: "وزارة المالية (الكويت)",
    bahrain_nbr: "NBR (البحرين)",
    oman_tax: "هيئة الضرائب (عُمان)",
    qatar_gta: "GTA (قطر)",
  };
  const authorityLabel = authorityLabels[input.authority] || input.authority;
  const companyDisplay = companyName || input.companySlug;
  const invoiceDisplay = input.invoiceId ? `#${input.invoiceId}` : "—";
  const uuidShort = input.externalUuid ? input.externalUuid.slice(0, 13) + "…" : "—";
  const reason = input.rejectionReason || "لم يُذكر سبب الرفض";

  const title = `🚫 رفض فاتورة من ${authorityLabel}`;
  const body = [
    `الشركة: ${companyDisplay}`,
    `الفاتورة: ${invoiceDisplay}`,
    `UUID: ${uuidShort}`,
    `السلطة: ${authorityLabel}`,
    `السبب: ${reason}`,
    `Receipt ID: ${input.receiptId.slice(0, 12)}…`,
  ].join("\n");

  const emailSubject = `🚫 [GarfiX] رفض فاتورة من ${authorityLabel} — ${companyDisplay}`;
  const emailText = [
    `مرحباً،`,
    ``,
    `تم استلام إشعار رفض فاتورة إلكترونية من ${authorityLabel}:`,
    ``,
    `الشركة: ${companyDisplay}`,
    `رقم الفاتورة: ${invoiceDisplay}`,
    `UUID: ${input.externalUuid || "—"}`,
    `السلطة: ${authorityLabel}`,
    `سبب الرفض: ${reason}`,
    `Receipt ID: ${input.receiptId}`,
    ``,
    `يرجى مراجعة الفاتورة في GarfiX وتعديلها ثم إعادة إرسالها للهيئة.`,
    ``,
    `— GarfiX ERP`,
  ].join("\n");

  const whatsappText = [
    `🚫 *رفض فاتورة من ${authorityLabel}*`,
    ``,
    `الشركة: ${companyDisplay}`,
    `الفاتورة: ${invoiceDisplay}`,
    `السبب: ${reason}`,
    ``,
    `يرجى مراجعة الفاتورة في GarfiX وإعادة إرسالها.`,
  ].join("\n");

  return { title, body, emailSubject, emailText, whatsappText };
}

// ─── Channel senders ──────────────────────────────────────────────────────

async function sendInAppNotification(
  admins: Array<{ uid: string; email: string; displayName: string }>,
  companySlug: string,
  title: string,
  body: string,
): Promise<{ sent: boolean; notificationIds?: number[]; error?: string }> {
  if (admins.length === 0) {
    return { sent: false, error: "No admin users found for company" };
  }
  try {
    const created = await Promise.all(
      admins.map((admin) =>
        db.notification.create({
          data: {
            userUid: admin.uid,
            companySlug,
            type: "e_invoice_rejected",
            title,
            body,
            isRead: false,
          },
          select: { id: true },
        }),
      ),
    );
    return { sent: true, notificationIds: created.map((c) => c.id) };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendEmailNotification(
  to: string,
  subject: string,
  text: string,
): Promise<{ sent: boolean; messageId?: string; error?: string; skipped?: boolean }> {
  try {
    // Check if SendGrid is configured
    const cfg = await getIntegrationConfig("sendgrid");
    if (!cfg?.api_key) {
      return { sent: false, skipped: true, error: "SendGrid not configured" };
    }
    const result = await sendgridProvider.sendEmail({
      to,
      subject,
      body: { text, html: `<pre style="font-family: monospace; white-space: pre-wrap; direction: rtl;">${text}</pre>` },
    });
    return {
      sent: result.ok,
      messageId: result.messageId,
      error: result.error,
    };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendWhatsAppNotification(
  to: string,
  text: string,
): Promise<{ sent: boolean; error?: string; skipped?: boolean }> {
  try {
    const cfg = await getIntegrationConfig("whatsapp");
    if (!cfg?.access_token) {
      return { sent: false, skipped: true, error: "WhatsApp not configured" };
    }
    const result = await whatsappProvider.sendTextMessage(to, text);
    return { sent: result.ok, error: result.error };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Main dispatcher ──────────────────────────────────────────────────────

/**
 * Dispatch rejection notifications for a webhook receipt.
 *
 * Called by recordReceipt() when status === "rejected".
 *
 * Throttled: 1 notification per (companySlug, externalUuid) per hour.
 * Best-effort: failures in email/WhatsApp don't block the in-app notification.
 */
export async function dispatchRejectionNotification(
  input: RejectionNotificationInput,
): Promise<NotificationResult> {
  const result: NotificationResult = {
    inApp: { sent: false },
    email: { sent: false, skipped: true },
    whatsapp: { sent: false, skipped: true },
    throttled: false,
  };

  // ── Skip placeholder company slugs ──────────────────────────────────
  if (!input.companySlug || input.companySlug === "_unknown") {
    logger.info("[e-invoicing:notifications] skipping — unknown company", {
      receiptId: input.receiptId,
    });
    // FIX #23 (MEDIUM): use skipped flag, not throttled, so caller can distinguish
    result.skipped = true;
    return result;
  }

  // ── Throttle check ──────────────────────────────────────────────────
  const throttled = await isThrottled(input.companySlug, input.externalUuid, input.invoiceId);
  if (throttled) {
    logger.info("[e-invoicing:notifications] throttled — already sent recently", {
      companySlug: input.companySlug,
      externalUuid: input.externalUuid,
      invoiceId: input.invoiceId,
    });
    result.throttled = true;
    return result;
  }

  // ── Build content ───────────────────────────────────────────────────
  const contact = await getCompanyContact(input.companySlug);
  const content = buildNotificationContent(input, contact.name);

  // ── 1. In-app notification (always — fallback channel) ──────────────
  const admins = await findCompanyAdmins(input.companySlug);
  const inAppResult = await sendInAppNotification(
    admins, input.companySlug, content.title, content.body,
  );
  result.inApp = inAppResult;

  // ── 2. Email (if configured + admin has email) ──────────────────────
  // Send to the first admin's email (they're the primary contact)
  const adminEmail = admins[0]?.email;
  if (adminEmail) {
    const emailResult = await sendEmailNotification(
      adminEmail, content.emailSubject, content.emailText,
    );
    result.email = emailResult;
  } else {
    result.email = { sent: false, skipped: true, error: "No admin email available" };
  }

  // ── 3. WhatsApp (if configured + company has phone) ─────────────────
  if (contact.phone) {
    const waResult = await sendWhatsAppNotification(contact.phone, content.whatsappText);
    result.whatsapp = waResult;
  } else {
    result.whatsapp = { sent: false, skipped: true, error: "Company has no phone" };
  }

  logger.info("[e-invoicing:notifications] dispatched", {
    companySlug: input.companySlug,
    receiptId: input.receiptId,
    inApp: result.inApp.sent,
    email: result.email.sent,
    whatsapp: result.whatsapp.sent,
    throttled: false,
  });

  return result;
}
