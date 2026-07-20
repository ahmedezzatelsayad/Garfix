/**
 * aiAgents.ts — Three specialized AI agents.
 *
 * Each agent has a constrained scope (allowedIntents) and a tailored
 * system prompt in Arabic. The /api/ai/agents route uses this config
 * to:
 *   1. Decide whether the user's message is in scope (LLM classification)
 *   2. If in scope → callAI with the agent's systemPrompt
 *   3. If out of scope → return a redirect message
 *
 * All actions are executed via the same 2-step confirmation flow as
 * /api/ai/tools — agents never bypass permissions or audit logging.
 */

export type AgentType = "accounting" | "sales" | "inventory";

export interface AgentConfig {
  type: AgentType;
  name: string;
  nameAr: string;
  icon: string;
  systemPrompt: string;
  /** Subset of intents supported by /api/ai/tools */
  allowedIntents: string[];
  /** Short Arabic hint shown to users when redirecting */
  redirectHint: string;
}

export const AGENTS: Record<AgentType, AgentConfig> = {
  accounting: {
    type: "accounting",
    name: "Accounting Agent",
    nameAr: "وكيل المحاسبة",
    icon: "💰",
    systemPrompt:
      "أنت وكيل محاسبة متخصص. تجيب فقط على أسئلة المحاسبة والقيود والأرصدة وميزان المراجعة. لو سُئلت عن المبيعات أو المخزون، وجّه المستخدم لوكيل المبيعات أو المخزون.",
    allowedIntents: ["list_invoices", "get_client_balance"],
    redirectHint:
      "هذا السؤال خارج نطاقي. استخدم وكيل المبيعات أو المخزون لهذا.",
  },
  sales: {
    type: "sales",
    name: "Sales Agent",
    nameAr: "وكيل المبيعات",
    icon: "📈",
    systemPrompt:
      "أنت وكيل مبيعات متخصص. تنشئ فواتير، تعرض قوائم العملاء، تسجل مدفوعات. لو سُئلت عن المحاسبة أو المخزون، وجّه المستخدم للوكيل المناسب.",
    allowedIntents: [
      "create_invoice",
      "list_invoices",
      "list_clients",
      "get_client_balance",
      "mark_invoice_paid",
      "create_client",
    ],
    redirectHint:
      "هذا السؤال خارج نطاقي. استخدم وكيل المحاسبة أو المخزون لهذا.",
  },
  inventory: {
    type: "inventory",
    name: "Inventory Agent",
    nameAr: "وكيل المخزون",
    icon: "📦",
    systemPrompt:
      "أنت وكيل مخزون متخصص. تجيب على أسئلة المنتجات والكميات والمشتريات. لا تنشئ فواتير. لو سُئلت عن الرواتب أو المحاسبة، وجّه المستخدم للوكيل المناسب.",
    allowedIntents: ["list_invoices"],
    redirectHint:
      "هذا السؤال خارج نطاقي. استخدم وكيل المحاسبة أو المبيعات لهذا.",
  },
};

export const AGENT_LIST: AgentConfig[] = Object.values(AGENTS);

/** Classifier prompt — asks the LLM whether a message is in scope for an agent. */
export function buildScopeClassifierPrompt(agent: AgentConfig, userMessage: string): string {
  return `أنت مصنّف أسئلة. مهمتك تحديد إن كان السؤال التالي داخل نطاق وكيل "${agent.nameAr}".

نطاق الوكيل: ${agent.systemPrompt}

السؤال: """${userMessage}"""

أجب فقط بكلمة واحدة: "yes" إذا كان السؤال داخل النطاق، أو "no" إذا كان خارج النطاق. لا تضف أي شرح.`;
}

export function isAgentType(v: unknown): v is AgentType {
  return v === "accounting" || v === "sales" || v === "inventory";
}

export default AGENTS;
