/**
 * context.ts — Build AI page context for the active company.
 *
 * The Copilot uses this to inject concise business context into the prompt so
 * responses are grounded in real numbers (invoice counts, revenue, outstanding
 * balance, etc.) instead of generic advice.
 */
import { db } from "@/lib/db";
import { num } from "@/lib/money";

export interface AIPageContext {
  companySlug?: string;
  totalInvoices: number;
  totalRevenue: number;
  totalPaid: number;
  totalOutstanding: number;
  clientsCount: number;
  productsCount: number;
  employeesCount: number;
  recentInvoices: Array<{
    invoiceNumber: string;
    clientName: string;
    total: number;
    status: string;
    issueDate: string;
  }>;
}

/**
 * Empty context returned when there's no active company. Lets callers branch
 * on `companySlug` to decide whether to include context at all.
 */
function emptyContext(): AIPageContext {
  return {
    totalInvoices: 0,
    totalRevenue: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    clientsCount: 0,
    productsCount: 0,
    employeesCount: 0,
    recentInvoices: [],
  };
}

/**
 * Build a compact snapshot of the company's business state from the database.
 *
 * Pulls only what the Copilot needs to answer common questions
 * ("كم مستحق عليّ؟" / "كم فاتورة هذا الشهر؟"). For deeper queries the AI tools
 * endpoint does its own targeted lookups.
 */
export async function buildAIContext(companySlug?: string): Promise<AIPageContext> {
  if (!companySlug) {
    return emptyContext();
  }

  const [invoices, clientsCount, productsCount, employeesCount] = await Promise.all([
    db.invoice.findMany({
      where: { companySlug },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        invoiceNumber: true,
        clientName: true,
        total: true,
        paid: true,
        status: true,
        issueDate: true,
      },
    }),
    db.client.count({ where: { companySlug } }),
    db.productCatalog.count({ where: { companySlug } }),
    db.employee.count({ where: { companySlug } }),
  ]);

  const totalRevenue = invoices.reduce((s, i) => s + num(i.total, 3), 0);
  const totalPaid = invoices.reduce((s, i) => s + num(i.paid, 3), 0);

  return {
    companySlug,
    totalInvoices: invoices.length,
    totalRevenue,
    totalPaid,
    totalOutstanding: Math.max(0, totalRevenue - totalPaid),
    clientsCount,
    productsCount,
    employeesCount,
    recentInvoices: invoices.map((i) => ({
      invoiceNumber: i.invoiceNumber,
      clientName: i.clientName,
      total: num(i.total, 3),
      status: i.status,
      issueDate: i.issueDate,
    })),
  };
}

/**
 * Render the context as a short Arabic string for inclusion in a system prompt.
 */
export function contextToPrompt(ctx: AIPageContext): string {
  return (
    `سياق الأعمال: ${ctx.totalInvoices} فاتورة، ` +
    `إيرادات ${ctx.totalRevenue.toFixed(3)}، ` +
    `محصّل ${ctx.totalPaid.toFixed(3)}، ` +
    `مستحق ${ctx.totalOutstanding.toFixed(3)}، ` +
    `${ctx.clientsCount} عميل، ` +
    `${ctx.productsCount} منتج، ` +
    `${ctx.employeesCount} موظف.`
  );
}
