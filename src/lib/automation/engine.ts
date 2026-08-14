/**
 * engine.ts — Rule-based Automation Engine.
 *
 * Triggers fire events; events are matched against active rules per company;
 * matching rules run their configured actions (send_whatsapp / create_task /
 * send_email). Each execution is recorded in `automation_execution_logs` with
 * status (success | failed | skipped) and duration.
 *
 * Usage:
 *   import { fireEvent } from "@/lib/automation/engine";
 *   await fireEvent({ type: "invoice_created", companySlug: "acme", data: { ... } });
 */
import { dbTyped as db } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface TriggerEvent {
  type: string; // invoice_created | stock_low | payment_overdue
  companySlug: string;
  data: Record<string, unknown>;
}

export interface RuleShape {
  id: string;
  name: string;
  condition: string;
  actions: string;
  companySlug: string;
}

export interface ActionShape {
  type: string;
  params?: Record<string, unknown>;
}

/**
 * Find all active rules for the given company + trigger and run them in order.
 * Errors in one rule never affect the next.
 */
export async function fireEvent(event: TriggerEvent): Promise<void> {
  let rules: Awaited<ReturnType<typeof db.automationRule.findMany>> = [];
  try {
    rules = await db.automationRule.findMany({
      where: { companySlug: event.companySlug, trigger: event.type, isActive: true },
    });
  } catch (err) {
    logger.error("[automation] failed to load rules", {
      err: err instanceof Error ? err.message : String(err),
      trigger: event.type,
      company: event.companySlug,
    });
    return;
  }

  logger.info("[automation] firing event", {
    trigger: event.type,
    company: event.companySlug,
    rulesMatched: rules.length,
  });

  for (const rule of rules) {
    try {
      await executeRule(
        {
          id: rule.id,
          name: rule.name,
          condition: rule.condition ?? "",
          actions: rule.actions ?? "",
          companySlug: rule.companySlug,
        },
        event,
      );
    } catch (err) {
      // Should never happen — executeRule swallows its own errors — but
      // guard anyway so one bad rule can't break the rest of the loop.
      logger.error("[automation] executeRule threw (unexpected)", {
        ruleId: rule.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Execute one rule: evaluate the condition, run each action, write the log.
 * Never throws — every failure is captured and persisted.
 */
export async function executeRule(rule: RuleShape, event: TriggerEvent): Promise<void> {
  const _start = Date.now();
  let status = "pending";
  let error: string | null = null;

  try {
    const condition = JSON.parse(rule.condition || "{}") as {
      minAmount?: number;
      maxAmount?: number;
      equals?: unknown;
      [k: string]: unknown;
    };

    // ─── Condition checks (simple, additive) ───────────────────────────────
    if (typeof condition.minAmount === "number" && event.data.amount !== undefined) {
      if (Number(event.data.amount) < condition.minAmount) {
        status = "skipped";
        return;
      }
    }
    if (typeof condition.maxAmount === "number" && event.data.amount !== undefined) {
      if (Number(event.data.amount) > condition.maxAmount) {
        status = "skipped";
        return;
      }
    }
    if ("equals" in condition && condition.equals !== undefined) {
      // `equals` is a map of { fieldPath: expectedValue } — all must match
      const eq = condition.equals as Record<string, unknown> | undefined;
      if (eq && typeof eq === "object") {
        for (const [k, v] of Object.entries(eq)) {
          if (event.data[k] !== v) {
            status = "skipped";
            return;
          }
        }
      }
    }

    // ─── Run actions ───────────────────────────────────────────────────────
    let actions: ActionShape[] = [];
    try {
      actions = JSON.parse(rule.actions || "[]") as ActionShape[];
    } catch {
      actions = [];
    }

    for (const action of actions) {
      await executeAction(action, event);
    }
    status = "success";
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : String(err);
    logger.error("[automation] rule execution failed", {
      ruleId: rule.id,
      err: error,
    });
  } finally {
    try {
      await db.automationExecutionLog.create({
        data: {
          ruleId: rule.id,
          status,
          result: JSON.stringify(event.data),
          error,
        },
      });
    } catch (logErr) {
      // Last-ditch — never throw from finally
      logger.error("[automation] failed to persist execution log", {
        ruleId: rule.id,
        err: logErr instanceof Error ? logErr.message : String(logErr),
      });
    }
  }
}

/**
 * Run a single action. Unknown action types log a warning (don't fail the rule).
 */
async function executeAction(action: ActionShape, event: TriggerEvent): Promise<void> {
  switch (action.type) {
    case "send_whatsapp": {
      // CODE-004 FIX: Real WhatsApp integration via Integration SDK
      try {
        const { getIntegrationConfig } = await import("@/lib/integrations/registry");
        const creds = await getIntegrationConfig("whatsapp");
        if (!creds?.access_token || !creds?.phone_number_id) {
          logger.warn("[automation] send_whatsapp skipped — WhatsApp not configured", { company: event.companySlug });
          return;
        }
        const phone = action.params?.phone || action.params?.to;
        const message = action.params?.message || "إشعار من GarfiX";
        if (!phone) {
          logger.warn("[automation] send_whatsapp skipped — no phone number", { company: event.companySlug });
          return;
        }
        const res = await fetch(`https://graph.facebook.com/v18.0/${creds.phone_number_id}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${creds.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone,
            type: "text",
            text: { body: message },
          }),
        });
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`WhatsApp API error ${res.status}: ${errBody.slice(0, 200)}`);
        }
        logger.info("[automation] send_whatsapp success", { to: phone, company: event.companySlug });
      } catch (err) {
        logger.error("[automation] send_whatsapp failed", { err: err instanceof Error ? err.message : String(err), company: event.companySlug });
        throw err; // Re-throw so executeRule logs it as failure
      }
      break;
    }
    case "create_task": {
      // Create a support ticket as a task
      try {
        await db.supportTicket.create({
          data: {
            userEmail: String(action.params?.assignedTo || "system"),
            subject: String(action.params?.title || "مهمة تلقائية"),
            body: String(action.params?.description || JSON.stringify(event.data)),
            status: "open",
            priority: String(action.params?.priority || "normal"),
            companySlug: event.companySlug,
          },
        });
        logger.info("[automation] create_task success", { title: action.params?.title });
      } catch (err) {
        logger.error("[automation] create_task failed", { err: err instanceof Error ? err.message : String(err) });
        throw err;
      }
      break;
    }
    case "send_email": {
      // WIRE-UP: Real email sending via SendGrid (if configured) or SMTP
      try {
        const emailTo = String(action.params?.email || action.params?.to || "");
        const subject = String(action.params?.subject || "إشعار من GarfiX");
        const body = String(action.params?.body || action.params?.message || "إشعار تلقائي");
        if (!emailTo) {
          logger.warn("[automation] send_email skipped — no email address");
          return;
        }

        // Try SendGrid first (if configured)
        try {
          const { getIntegrationConfig } = await import("@/lib/integrations/registry");
          const sgConfig = await getIntegrationConfig("sendgrid");
          if (sgConfig?.api_key) {
            const { sendgridProvider } = await import("@/lib/integrations/sendgrid");
            const sgResult = await (sendgridProvider as  {
              sendEmail: (params: {
                to: string;
                subject: string;
                body: { text: string; html?: string };
              }) => Promise<{ ok: boolean; error?: string }>;
            }).sendEmail({
              to: emailTo,
              subject,
              body: { text: body },
            });
            if (sgResult.ok) {
              logger.info("[automation] send_email sent via SendGrid", { to: emailTo, subject, company: event.companySlug });
              break;
            }
            logger.warn("[automation] SendGrid failed, trying SMTP", { error: sgResult.error });
          }
        } catch {
          // SendGrid not configured — fall through to SMTP
        }

        // Fall back to SMTP (via email.ts)
        try {
          const { sendEmail } = await import("@/lib/email");
          const result = await sendEmail({ to: emailTo, subject, body });
          if (result.ok) {
            logger.info("[automation] send_email sent via SMTP", { to: emailTo, subject, company: event.companySlug });
          } else {
            logger.warn("[automation] send_email SMTP failed, logging only", { to: emailTo, reason: result.reason });
          }
        } catch {
          logger.info("[automation] send_email (no SMTP configured, logged only)", { to: emailTo, subject, company: event.companySlug });
        }
      } catch (err) {
        logger.error("[automation] send_email failed", { err: err instanceof Error ? err.message : String(err) });
        throw err;
      }
      break;
    }
    case "send_sms": {
      // WIRE-UP: Send SMS via Twilio integration
      try {
        const phone = String(action.params?.phone || action.params?.to || "");
        const message = String(action.params?.message || "إشعار من GarfiX");
        if (!phone) {
          logger.warn("[automation] send_sms skipped — no phone number");
          return;
        }

        const { getIntegrationConfig } = await import("@/lib/integrations/registry");
        const twilioConfig = await getIntegrationConfig("twilio");
        if (!twilioConfig?.account_sid || !twilioConfig?.auth_token) {
          logger.info("[automation] send_sms skipped — Twilio not configured", { company: event.companySlug });
          return;
        }

        const { twilioProvider } = await import("@/lib/integrations/twilio");
        const result = await (twilioProvider as  {
          sendSms: (to: string, body: string) => Promise<{ ok: boolean; error?: string; sid?: string }>;
        }).sendSms(phone, message);

        if (!result.ok) {
          throw new Error(`Twilio SMS failed: ${result.error}`);
        }
        logger.info("[automation] send_sms success", { to: phone, sid: result.sid, company: event.companySlug });
      } catch (err) {
        logger.error("[automation] send_sms failed", { err: err instanceof Error ? err.message : String(err), company: event.companySlug });
        throw err;
      }
      break;
    }
    default: {
      logger.warn("[automation] unknown action type", { type: action.type });
    }
  }
}
