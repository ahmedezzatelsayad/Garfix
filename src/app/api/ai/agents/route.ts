/**
 * /api/ai/agents
 *
 * POST — route a user message to one of three specialized AI agents.
 *
 * Body: { agentType: "accounting" | "sales" | "inventory", message: string, companySlug: string }
 *
 * Flow:
 *   1. Auth + company access check
 *   2. Look up the agent's config (systemPrompt, allowedIntents)
 *   3. Ask the LLM (classifier) whether the message is within the agent's scope
 *      - If NO → return { ok, inScope: false, response: agent.redirectHint, ... }
 *      - If YES → call the LLM with the agent's systemPrompt + user message
 *        → return { ok, inScope: true, response, allowedIntents, ... }
 *
 * All action execution still goes through /api/ai/tools with the same
 * 2-step confirmation (preview → confirm) — agents never bypass that.
 * The agent's response includes `allowedIntents` so the client knows
 * which intents it can safely suggest to the user.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth, assertCompanyAccess } from "@/lib/auth";
import { callAI as callAIProvider } from "@/lib/aiProvider";
import {
  AGENTS,
  isAgentType,
  buildScopeClassifierPrompt,
  type AgentType,
} from "@/lib/aiAgents";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { apiError, withErrorHandler, parseJsonBody } from "@/lib/api";
import { rateLimitResponse, LIMITS } from "@/lib/rateLimit";

const RequestSchema = z.object({
  agentType: z.string().min(1),
  message: z.string().min(1, "الرسالة مطلوبة"),
  companySlug: z.string().min(1, "companySlug is required"),
});

/**
 * Call the LLM with a system prompt and a single user message.
 * Returns the assistant's text response.
 */
async function callLLM(systemPrompt: string, userMessage: string): Promise<string> {
  try {
    const result = await callAIProvider({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.4,
      maxTokens: 800,
    });
    return typeof result.content === "string" ? result.content : String(result.content || "");
  } catch (err) {
    logger.error("[ai/agents] LLM call failed", { err: err instanceof Error ? err.message : String(err) });
    return "عذراً، حدث خطأ أثناء معالجة طلبك. حاول مرة أخرى لاحقاً.";
  }
}

/**
 * Classify whether the user's message is within the agent's scope.
 * Returns true if the LLM says "yes".
 */
async function isInScope(agentType: AgentType, userMessage: string): Promise<boolean> {
  const agent = AGENTS[agentType];
  const classifierPrompt = buildScopeClassifierPrompt(agent, userMessage);
  const reply = await callLLM(
    "أنت مصنّف أسئلة دقيق. تجيب فقط بكلمة yes أو no.",
    classifierPrompt,
  );
  const trimmed = reply.trim().toLowerCase();
  // Be lenient: any reply that starts with yes counts
  return trimmed.startsWith("yes") || trimmed === "نعم" || trimmed.includes("yes");
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = result.user;

  // SEC-FIX: Rate limit AI endpoints to prevent cost abuse
  const limited = await rateLimitResponse(req, "ai-agents", LIMITS.AI_BULK, user.uid);
  if (limited) return limited;

  const body = await parseJsonBody(req);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues?.[0]?.message || "Invalid input", 400);
  }
  const { message, companySlug } = parsed.data;

  if (!isAgentType(parsed.data.agentType)) {
    return apiError(
      `agentType must be one of: accounting, sales, inventory (got "${parsed.data.agentType}")`,
      400,
    );
  }
  const agentType = parsed.data.agentType;
  const agent = AGENTS[agentType];

  // Enforce company access
  if (!assertCompanyAccess(user, companySlug)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ─── Step 1: scope classification ─────────────────────────────────────
  let inScope = true;
  try {
    inScope = await isInScope(agentType, message);
  } catch (err) {
    logger.warn("[ai/agents] classifier failed — assuming in scope", { err: err instanceof Error ? err.message : String(err), agentType });
    // Fail-open: if the classifier errors, assume in scope so the user
    // still gets a helpful response rather than a hard error.
    inScope = true;
  }

  if (!inScope) {
    await logAudit({
      userEmail: user.email,
      userUid: user.uid,
      action: "ai_agent_redirect",
      entity: "ai_agent",
      companySlug,
      details: { agentType, messagePreview: message.slice(0, 80) },
    });

    return NextResponse.json({
      ok: true,
      inScope: false,
      agentType,
      agentName: agent.nameAr,
      agentIcon: agent.icon,
      response: agent.redirectHint,
      allowedIntents: agent.allowedIntents,
    });
  }

  // ─── Step 2: in-scope → call LLM with the agent's system prompt ───────
  const response = await callLLM(agent.systemPrompt, message);

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "ai_agent_reply",
    entity: "ai_agent",
    companySlug,
    details: {
      agentType,
      messagePreview: message.slice(0, 80),
      responsePreview: response.slice(0, 80),
    },
  });

  return NextResponse.json({
    ok: true,
    inScope: true,
    agentType,
    agentName: agent.nameAr,
    agentIcon: agent.icon,
    response,
    allowedIntents: agent.allowedIntents,
    // Hint to the client: any action the agent suggests must still go
    // through /api/ai/tools with the 2-step confirmation flow.
    actionEndpoint: "/api/ai/tools",
  });
});

/**
 * GET — list the available agents (for the client to render a picker).
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    agents: Object.values(AGENTS).map((a) => ({
      type: a.type,
      name: a.name,
      nameAr: a.nameAr,
      icon: a.icon,
      allowedIntents: a.allowedIntents,
    })),
  });
});
