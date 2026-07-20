/**
 * emailWorker.ts — Worker for the EMAIL queue.
 *
 * Registered as the handler for `QUEUE_NAMES.EMAIL`. Any job enqueued via
 * `enqueueBackground(QUEUE_NAMES.EMAIL, { type: "send-email", data })` (or
 * via the `enqueueEmail()` helper in lib/email.ts) gets routed here.
 *
 * Supported job types:
 *   - "send-email"     → generic email send (uses SendEmailInput shape)
 *   - "send-otp"       → OTP code email (renders Arabic template)
 *   - "send-welcome"   → new-user welcome email
 *   - "send-ticket-reply" → support ticket reply notification
 *
 * Failure modes:
 *   - SMTP not configured → job "succeeds" as skipped (logged) — no retry
 *     storm on dev boxes without SMTP.
 *   - SMTP transport failure → throws → queue runner retries with backoff,
 *     eventually dead-letters.
 *   - Malformed payload → throws → dead-letter (won't retry forever on bad
 *     data the caller can never fix).
 *
 * This worker is the missing counterpart to the EMAIL queue declared in
 * queues.ts. Before this file existed, any code that called
 * `enqueue(QUEUE_NAMES.EMAIL, ...)` would silently dead-letter every job
 * with "No handler registered for queue email-jobs".
 */

import { logger } from "../logger";
import { registerWorker, QUEUE_NAMES } from "../queues";
import { sendEmail, type SendEmailInput } from "../email";

/** Canonical job type strings — exported for use by callers. */
export const EMAIL_JOB_TYPES = {
  SEND_EMAIL: "send-email",
  SEND_OTP: "send-otp",
  SEND_WELCOME: "send-welcome",
  SEND_TICKET_REPLY: "send-ticket-reply",
} as const;

/** The actual handler — exported for direct invocation from tests. */
export async function handleEmailJob(data: Record<string, unknown>): Promise<void> {
  // The job `type` is on the envelope (queues.ts JobPayload), but the worker
  // handler only receives `data`. We embed a `type` field inside `data` so
  // the worker can route — this matches the AI worker's pattern.
  const jobType = (data.type as string) || EMAIL_JOB_TYPES.SEND_EMAIL;
  const payload = data.payload ?? data;

  switch (jobType) {
    case EMAIL_JOB_TYPES.SEND_EMAIL:
      return handleSendEmail(payload as Record<string, unknown>);
    case EMAIL_JOB_TYPES.SEND_OTP:
      return handleSendOtp(payload as Record<string, unknown>);
    case EMAIL_JOB_TYPES.SEND_WELCOME:
      return handleSendWelcome(payload as Record<string, unknown>);
    case EMAIL_JOB_TYPES.SEND_TICKET_REPLY:
      return handleSendTicketReply(payload as Record<string, unknown>);
    default:
      // Unknown type — don't retry forever, dead-letter immediately by
      // throwing (the queue runner will retry up to maxAttempts then
      // dead-letter; on a permanent unknown-type error that's the right
      // outcome — the caller must fix the type string).
      throw new Error(`emailWorker: unknown job type "${jobType}"`);
  }
}

async function handleSendEmail(data: Record<string, unknown>): Promise<void> {
  const input = data as unknown as Partial<SendEmailInput>;
  if (!input.to || !input.subject || !input.body) {
    throw new Error(`emailWorker.send-email: missing required fields (to/subject/body) — ${JSON.stringify(data).slice(0, 200)}`);
  }
  const result = await sendEmail({
    to: input.to,
    subject: input.subject,
    body: input.body,
    html: input.html,
    replyTo: input.replyTo,
    from: input.from,
  });
  if (!result.ok) {
    throw new Error(`emailWorker.send-email: send failed — ${result.reason ?? "unknown"}`);
  }
  // skipped (no SMTP) is treated as success — no retry
}

async function handleSendOtp(data: Record<string, unknown>): Promise<void> {
  const { to, code, purpose } = data as { to?: string; code?: string; purpose?: string };
  if (!to || !code) {
    throw new Error(`emailWorker.send-otp: missing 'to' or 'code' — ${JSON.stringify(data).slice(0, 200)}`);
  }
  const purposeAr = purpose === "login" ? "تسجيل الدخول" : purpose === "reset" ? "إعادة تعيين كلمة المرور" : "التحقق";
  const subject = `رمز ${purposeAr} — GarfiX`;
  const body =
    `مرحباً،\n\n` +
    `رمز ${purposeAr} الخاص بك هو: ${code}\n\n` +
    `ينتهي الرمز خلال 10 دقائق. إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.\n\n` +
    `— فريق GarfiX`;
  const html =
    `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">` +
    `<h2 style="color:#0f766e">رمز ${purposeAr}</h2>` +
    `<p>رمز ${purposeAr} الخاص بك هو:</p>` +
    `<p style="font-size:32px;font-weight:bold;letter-spacing:4px;color:#0f766e;background:#f0fdfa;padding:16px;border-radius:8px;text-align:center">${code}</p>` +
    `<p style="color:#64748b;font-size:13px">ينتهي الرمز خلال 10 دقائق. إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.</p>` +
    `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">` +
    `<p style="color:#94a3b8;font-size:12px">— فريق GarfiX</p>` +
    `</div>`;
  await sendEmail({ to, subject, body, html });
}

async function handleSendWelcome(data: Record<string, unknown>): Promise<void> {
  const { to, name } = data as { to?: string; name?: string };
  if (!to) {
    throw new Error(`emailWorker.send-welcome: missing 'to' — ${JSON.stringify(data).slice(0, 200)}`);
  }
  const subject = "مرحباً بك في GarfiX";
  const body =
    `مرحباً ${name || ""}،\n\n` +
    `مرحباً بك في GarfiX — نظام إدارة الفواتير والمحاسبة والموارد البشرية الذكي.\n\n` +
    `يمكنك البدء بإضافة شركتك الأولى من لوحة التحكم. إذا احتجت أي مساعدة، فريقنا جاهز.\n\n` +
    `— فريق GarfiX`;
  await sendEmail({ to, subject, body });
}

async function handleSendTicketReply(data: Record<string, unknown>): Promise<void> {
  const { to, ticketSubject, replyBody, ticketId } = data as {
    to?: string; ticketSubject?: string; replyBody?: string; ticketId?: string | number;
  };
  if (!to || !ticketSubject) {
    throw new Error(`emailWorker.send-ticket-reply: missing 'to' or 'ticketSubject' — ${JSON.stringify(data).slice(0, 200)}`);
  }
  const subject = `رد على تذكرتك: ${ticketSubject}`;
  const body =
    `مرحباً،\n\n` +
    `ورد رد جديد على تذكرتك #${ticketId ?? "?"} (${ticketSubject}):\n\n` +
    `${replyBody ?? "(لا يوجد محتوى)"}\n\n` +
    `يمكنك متابعة التذكرة من لوحة التحكم.\n\n` +
    `— فريق GarfiX`;
  await sendEmail({ to, subject, body });
}

// ─── Module-level registration ─────────────────────────────────────────────

let registered = false;
export function registerEmailWorker(): void {
  if (registered) return;
  registerWorker(QUEUE_NAMES.EMAIL, handleEmailJob);
  registered = true;
  logger.info("[email-worker] registered for queue", { queue: QUEUE_NAMES.EMAIL });
}

// Side-effect: register immediately on module load.
registerEmailWorker();
