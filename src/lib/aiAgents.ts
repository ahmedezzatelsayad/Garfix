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
  description?: string;
}

export const AGENTS: Record<AgentType, AgentConfig> = {
  accounting: {
    type: "accounting",
    name: "Accounting Agent",
    nameAr: "الخبير المحاسبي",
    description: "أرصدة، قيود يومية، ميزان مراجعة، قوائم مالية، تقارير ضريبية",
    icon: "💰",
    systemPrompt:
      "أنت خبير محاسبة معتمد. تجيب فقط على أسئلة المحاسبة والقيود والأرصدة وميزان المراجعة والقوائم المالية والضرائب. لو سُئلت عن المبيعات أو المخزون، وجّه المستخدم لوكيل المبيعات أو المخزون.",
    allowedIntents: ["list_invoices", "get_client_balance"],
    redirectHint:
      "هذا سؤال مبيعات أو مخزون — ليس محاسبيًا. جرب وكيل المبيعات أو وكيل المخزون.",
  },
  sales: {
    type: "sales",
    name: "Sales Agent",
    nameAr: "مساعد المبيعات",
    description: "إنشاء فواتير، إدارة العملاء، تسجيل الدفعات، عروض الأسعار",
    icon: "📈",
    systemPrompt:
      "أنت مساعد مبيعات عملي. تنشئ فواتير فورًا، تعرض قوائم العملاء، تسجل مدفوعات، وتنشئ عملاء جددًا. لو سُئلت عن المحاسبة أو المخزون، وجّه المستخدم للوكيل المناسب.",
    allowedIntents: [
      "create_invoice",
      "list_invoices",
      "list_clients",
      "get_client_balance",
      "mark_invoice_paid",
      "create_client",
    ],
    redirectHint:
      "هذا سؤال محاسبي أو مخزني — جرب وكيل المحاسبة أو وكيل المخزون.",
  },
  inventory: {
    type: "inventory",
    name: "Inventory Agent",
    nameAr: "مراقب المخزون",
    description: "كميات المنتجات، مستويات المخزون، تنبيهات النقص، المشتريات",
    icon: "📦",
    systemPrompt:
      "أنت مراقب مخزون خبير. تجيب على أسئلة المنتجات والكميات ومستويات المخزون والمشتريات. لا تنشئ فواتير. لو سُئلت عن الرواتب أو المحاسبة، وجّه المستخدم للوكيل المناسب.",
    allowedIntents: ["list_invoices"],
    redirectHint:
      "هذا سؤال محاسبي أو مبيعات — جرب الخبير المحاسبي أو مساعد المبيعات.",
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
