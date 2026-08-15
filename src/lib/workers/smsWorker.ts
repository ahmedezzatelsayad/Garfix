/**
 * smsWorker.ts — Worker for the SMS queue.
 *
 * Sends SMS messages via Twilio integration. Jobs are enqueued via
 * `enqueue(QUEUE_NAMES.SMS, { type: "send-sms", data })`.
 *
 * Supported job types:
 *   - "send-sms"     → send a plain SMS message
 *
 * Failure modes:
 *   - Twilio not configured → job "succeeds" as skipped (logged)
 *   - Twilio API failure → throws → queue runner retries with backoff
 *   - Malformed payload → throws → dead-letter
 */

import { logger } from "../logger";
import { registerWorker, QUEUE_NAMES } from "../queues";

export const SMS_JOB_TYPES = {
  SEND_SMS: "send-sms",
} as const;

export async function handleSmsJob(data: Record<string, unknown>): Promise<void> {
  const jobType = (data.type as string) || SMS_JOB_TYPES.SEND_SMS;
  const payload = data.payload ?? data;

  switch (jobType) {
    case SMS_JOB_TYPES.SEND_SMS:
      return handleSendSms(payload as Record<string, unknown>);
    default:
      throw new Error(`smsWorker: unknown job type "${jobType}"`);
  }
}

async function handleSendSms(data: Record<string, unknown>): Promise<void> {
  const to = data.to as string;
  const body = data.body as string;

  if (!to || !body) {
    throw new Error(`smsWorker.send-sms: missing required fields (to/body)`);
  }

  // ── WIRE-UP: Use Twilio integration ──
  try {
    const { getIntegrationConfig } = await import("@/lib/integrations/registry");
    const twilioConfig = await getIntegrationConfig("twilio");
    if (!twilioConfig?.account_sid || !twilioConfig?.auth_token) {
      logger.info("[sms-worker] Twilio not configured — skipping SMS", { to });
      return; // Not an error — just skip silently like emailWorker does
    }

    const { twilioProvider } = await import("@/lib/integrations/twilio");
    const result = await (twilioProvider as  {
      sendSms: (to: string, body: string) => Promise<{ ok: boolean; error?: string; sid?: string }>;
    }).sendSms(to, body);

    if (!result.ok) {
      throw new Error(`smsWorker.send-sms: Twilio send failed — ${result.error}`);
    }

    logger.info("[sms-worker] SMS sent via Twilio", { to, sid: result.sid });
  } catch (err) {
    logger.error("[sms-worker] SMS send failed", { err: err instanceof Error ? err.message : String(err), to });
    throw err;
  }
}

// ─── Registration Function ─────────────────────────────────────────────────

let registered = false;
export function registerSmsWorker(): void {
  if (registered) return;
  registerWorker(QUEUE_NAMES.SMS, handleSmsJob);
  registered = true;
  logger.info("[sms-worker] registered for queue", { queue: QUEUE_NAMES.SMS });
}
