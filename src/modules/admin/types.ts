/**
 * Shared type definitions for the PlatformAdminPanel module and its
 * extracted sub-components. Keeps interfaces centralized so any tab
 * or drawer can import them without reaching into PlatformAdminPanel.
 */

export interface Stats {
  tenantsCount: number; usersCount: number; invoicesCount: number;
  ticketsOpen: number; totalRevenue: number;
  byPlan: Record<string, number>;
  monthlyGrowth: Array<{ month: string; tenants: number }>;
  [key: string]: any;
}

export interface Tenant {
  id: number; name: string; slug: string; nameAr?: string; emoji?: string;
  plan: string; subscriptionStatus: string; createdAt: string;
  stats: { invoices: number; users: number; clients: number; revenue: number };
  // P1.8: optional plan-limits block — present when /api/platform-admin/tenants
  // returns the new planLimits field. Older responses (cached) may omit it.
  planLimits?: {
    maxInvoicesPerMonth: number;
    maxUsers: number;
    maxCompanies: number;
    invoiceUtilization: number;
    userUtilization: number;
  };
  [key: string]: any;
}

export interface TenantDetail {
  tenant: {
    id: number; slug: string; name: string; nameAr?: string; emoji?: string;
    plan: string; subscriptionStatus: string; createdAt: string; deletedAt?: string | null;
  };
  overview: {
    invoicesCount: number;
    lastInvoice: { id: number; invoiceNumber: string; createdAt: string; total: string } | null;
    usersCount: number;
    clientsCount: number;
    movementsCount: number;
    reviewQueueCount: number;
    oversellCount: number;
    lastActivityAt: string;
  };
  [key: string]: any;
}

export interface Announcement {
  id: number; title: string; body: string; type: string; isActive: boolean; createdAt: string;
  [key: string]: any;
}

export interface TicketReply {
  id: string; senderEmail: string; senderRole: string; body: string; createdAt: string;
  [key: string]: any;
}

export interface Ticket {
  id: number; userEmail: string; subject: string; status: string; priority: string; createdAt: string;
  body?: string;
  replies?: TicketReply[];
  [key: string]: any;
}

export interface AdminAudit {
  id: number; adminEmail: string; action: string; targetType?: string; targetId?: string; createdAt: string;
  [key: string]: any;
}

export interface QueueFailure {
  id: number; queue: string; type?: string; payload: unknown; error: string; failedAt: string; attempts: number;
  queueName: string; errorMessage: string;
  [key: string]: any;
}

export interface StockMovement {
  id: number; companySlug: string; productId: number | null;
  productName: string; productCode: string | null;
  warehouseId: number; warehouseName: string; warehouseCode: string;
  qty: number; sourceType: string; sourceId: number | null;
  note: string | null; createdBy: string; createdAt: string;
  [key: string]: any;
}

export type Tab = "stats" | "tenants" | "announcements" | "tickets" | "audit" | "ai-settings" | "queue-failures" | "stock-ledger" | "feature-flags" | "ai-usage" | "ai-orchestration" | "review-queue" | "landing-content" | "integrations" | "retention-cleanup" | "plans" | "backups" | "webhooks";
