/**
 * email.ts — SMTP-backed email sender (E-14).
 *
 * Wraps nodemailer with the project's env-driven SMTP configuration. Used by
 * the emailWorker (QUEUE_NAMES.EMAIL) and by any caller that needs to send
 * mail synchronously with retries handled by the queue layer above it.
 *
 * Configuration (env):
 *   SMTP_HOST     — SMTP server hostname (e.g. smtp.mailgun.org)
 *   SMTP_PORT     — SMTP port (default 587)
 *   SMTP_USER     — SMTP auth username
 *   SMTP_PASSWORD — SMTP auth password
 *   SMTP_FROM     — From: address (e.g. "GarfiX <noreply@garfix.app>")
 *   SMTP_SECURE   — "true" for 465 (TLS), "false" for 587 (STARTTLS)
 *
 * Behavior:
 *   - If SMTP_HOST is missing → returns a structured "skipped" result (does
 *     NOT throw). Callers (e.g. the email worker) treat this as success so
 *     the job doesn't retry forever on an unconfigured dev box; the email
 *     payload is still logged for visibility.
 *   - If SMTP_HOST is set but send fails → throws so the queue runner can
 *     apply retries + dead-letter on permanent failure.
 *
 * Design note: we deliberately do NOT lazy-create the transporter on every
 * call — nodemailer's createTransport is cheap but not free, and the email
 * worker may burst-send dozens of OTPs per second during peak login. The
 * transporter is cached at module scope and re-created only if the env
 * config changes (which in practice it never does at runtime).
 */

import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  /** Optional HTML body — when omitted, `body` is sent as plain text only. */
  html?: string;
  /** Optional reply-to override (defaults to SMTP_FROM). */
  replyTo?: string;
  /** Optional custom From (defaults to SMTP_FROM). Must be authorized by SMTP provider. */
  from?: string;
}

export interface SendEmailResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  messageId?: string;
}

let cachedTransporter: Transporter | null = null;
let cachedConfigSignature = "";

function smtpConfigSignature(): string {
  return [
    process.env.SMTP_HOST ?? "",
    process.env.SMTP_PORT ?? "",
    process.env.SMTP_USER ?? "",
    process.env.SMTP_SECURE ?? "",
  ].join("|");
}

function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

/**
 * Lazily build (and cache) the nodemailer transporter. Returns null if SMTP
 * is not configured — callers must handle this by treating send as "skipped"
 * rather than failing.
 */
function getTransporter(): Transporter | null {
  if (!isSmtpConfigured()) return null;
  const sig = smtpConfigSignature();
  if (cachedTransporter && sig === cachedConfigSignature) return cachedTransporter;

  const host = process.env.SMTP_HOST!;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  try {
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" }
        : undefined,
      // Reasonable defaults — 30s connect, 30s greet, 30s message
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 30_000,
    });
    cachedConfigSignature = sig;
    logger.info("[email] SMTP transporter initialized", { host, port, secure });
    return cachedTransporter;
  } catch (err) {
    logger.error("[email] failed to create SMTP transporter", {
      host, port, err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Send an email. Throws on transport failure (so the queue layer can retry).
 * Returns { ok: true, skipped: true } when SMTP is not configured — callers
 * should treat this as "success without sending" (dev mode, no SMTP).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { to, subject, body, html, replyTo, from } = input;

  // Basic validation — refuse obviously broken addresses so we don't waste
  // SMTP connections on malformed input.
  if (!to || typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, reason: `invalid recipient address: ${String(to).slice(0, 100)}` };
  }
  if (!subject || typeof subject !== "string") {
    return { ok: false, reason: "missing or invalid subject" };
  }

  const transporter = getTransporter();
  if (!transporter) {
    // SMTP not configured — log the payload so a developer can see what
    // WOULD have been sent, then return "skipped". This is critical for dev
    // box UX: OTPs, ticket replies, etc. otherwise retry forever and flood
    // the dead-letter log.
    logger.info("[email] SMTP not configured — logging instead of sending", {
      to, subject, bodyPreview: body.slice(0, 200),
    });
    return { ok: true, skipped: true, reason: "SMTP not configured (dev mode)" };
  }

  const fromAddress = from || process.env.SMTP_FROM!;
  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      replyTo: replyTo || fromAddress,
      subject,
      text: body,
      html: html || undefined,
    });
    logger.info("[email] sent", { to, subject, messageId: info.messageId });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("[email] send failed", { to, subject, err: reason });
    // Re-throw so the queue runner retries with backoff
    throw new Error(`email send failed to ${to}: ${reason}`);
  }
}

/**
 * Convenience helper: enqueue an email job without the caller needing to
 * import QUEUE_NAMES + enqueue from queues.ts. Wraps the payload in the
 * canonical "send-email" job type.
 */
export async function enqueueEmail(input: SendEmailInput): Promise<void> {
  const { enqueue, QUEUE_NAMES } = await import("./queues");
  await enqueue(QUEUE_NAMES.EMAIL, {
    type: "send-email",
    data: input as unknown as Record<string, unknown>,
  });
}

/** Test the SMTP connection (verify). Used by the founder panel health check. */
export async function testEmailConnection(): Promise<{ ok: boolean; error?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return { ok: false, error: "SMTP not configured" };
  }
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
