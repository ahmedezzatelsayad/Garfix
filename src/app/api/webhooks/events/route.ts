/**
 * /api/webhooks/events
 * GET  — List available webhook event types.
 * POST — Trigger a test event (ping) to verify an endpoint is working.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { withErrorHandler, parseJsonBody, apiError, apiOk, validateBody } from "@/lib/api";
import { dispatchWebhook, WebhookPayload } from "@/lib/webhooks";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { z } from "zod";

// ── Available event types ────────────────────────────────────────────────────

export const WEBHOOK_EVENT_TYPES: Array<{ id: string; label: string; labelAr: string; group: string; description: string }> = [
  // Invoice events
  { id: "invoice.created", label: "Invoice Created", labelAr: "فاتورة جديدة", group: "financial", description: "Triggered when a new invoice is created" },
  { id: "invoice.updated", label: "Invoice Updated", labelAr: "تحديث فاتورة", group: "financial", description: "Triggered when an invoice is edited" },
  { id: "invoice.deleted", label: "Invoice Deleted", labelAr: "حذف فاتورة", group: "financial", description: "Triggered when an invoice is deleted" },
  { id: "invoice.status_changed", label: "Invoice Status Changed", labelAr: "تغيير حالة فاتورة", group: "financial", description: "Triggered when an invoice's payment status changes" },
  { id: "invoice.e_invoice_submitted", label: "E-Invoice Submitted", labelAr: "فاتورة إلكترونية", group: "financial", description: "Triggered when an e-invoice is submitted to the authority" },
  // Payment events
  { id: "payment.initiated", label: "Payment Initiated", labelAr: "بدء دفع", group: "financial", description: "Triggered when a payment is initiated" },
  { id: "payment.completed", label: "Payment Completed", labelAr: "إتمام دفع", group: "financial", description: "Triggered when a payment is completed" },
  { id: "payment.failed", label: "Payment Failed", labelAr: "فشل دفع", group: "financial", description: "Triggered when a payment attempt fails" },
  // Customer events
  { id: "customer.created", label: "Customer Created", labelAr: "عميل جديد", group: "customer", description: "Triggered when a new customer is added" },
  { id: "customer.updated", label: "Customer Updated", labelAr: "تحديث عميل", group: "customer", description: "Triggered when a customer is edited" },
  { id: "customer.deleted", label: "Customer Deleted", labelAr: "حذف عميل", group: "customer", description: "Triggered when a customer is removed" },
  // Inventory events
  { id: "inventory.low_stock", label: "Low Stock Alert", labelAr: "تنبيه مخزون منخفض", group: "operations", description: "Triggered when an item falls below minimum stock" },
  { id: "inventory.stock_updated", label: "Stock Updated", labelAr: "تحديث مخزون", group: "operations", description: "Triggered when stock quantities change" },
  { id: "movement.created", label: "Inventory Movement", labelAr: "حركة مخزون", group: "operations", description: "Triggered when an inventory movement is recorded" },
  // Accounting events
  { id: "accounting.journal_created", label: "Journal Entry Created", labelAr: "قيد يومية جديد", group: "financial", description: "Triggered when a journal entry is created" },
  { id: "accounting.period_closed", label: "Fiscal Period Closed", labelAr: "إقفال فترة مالية", group: "financial", description: "Triggered when a fiscal period is closed" },
  // HR events
  { id: "hr.employee_created", label: "Employee Created", labelAr: "موظف جديد", group: "hr", description: "Triggered when a new employee is added" },
  { id: "hr.salary_processed", label: "Salary Processed", labelAr: "معالجة راتب", group: "hr", description: "Triggered when a salary is processed" },
  // System events
  { id: "system.backup_completed", label: "Backup Completed", labelAr: "نسخ احتياطي مكتمل", group: "admin", description: "Triggered when a backup completes" },
  { id: "system.error_alert", label: "Error Alert", labelAr: "تنبيه خطأ", group: "admin", description: "Triggered on critical system errors" },
  // Wildcard
  { id: "*", label: "All Events", labelAr: "كل الأحداث", group: "admin", description: "Subscribe to all webhook events" },
];

// ── GET: List events ──────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Group events by category
  const grouped: Record<string, typeof WEBHOOK_EVENT_TYPES> = {};
  for (const evt of WEBHOOK_EVENT_TYPES) {
    if (!grouped[evt.group]) grouped[evt.group] = [];
    grouped[evt.group].push(evt);
  }

  return apiOk({
    events: WEBHOOK_EVENT_TYPES,
    groups: grouped,
    total: WEBHOOK_EVENT_TYPES.length,
  });
});

// ── POST: Trigger test event ──────────────────────────────────────────────

const TestEventSchema = z.object({
  endpointId: z.string().min(1),
  eventType: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const result = await resolveAuth(req);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = result.user;
  const companySlug = user.companies?.[0];
  if (!companySlug) return apiError("No company associated", 400);

  const isFounder = user.email === process.env.FOUNDER_EMAIL;
  if (user.role !== "admin" && !isFounder) {
    return apiError("Only admin or founder can trigger test events", 403);
  }

  const body = await parseJsonBody(req);
  const validation = validateBody(TestEventSchema, body);
  if (!validation.ok) return validation.response;

  // Verify the endpoint exists and belongs to the company
  const endpoint = await db.webhookEndpoint.findUnique({
    where: { id: validation.data.endpointId },
  });
  if (!endpoint) return apiError("Endpoint not found", 404);
  if (endpoint.companySlug !== companySlug && !isFounder) {
    return apiError("Access denied", 403);
  }

  // Create a test payload
  const testPayload: WebhookPayload = {
    event: validation.data.eventType,
    companySlug,
    timestamp: new Date().toISOString(),
    data: {
      test: true,
      triggeredBy: user.email,
      message: `Test event: ${validation.data.eventType}`,
      sampleData: {
        invoiceId: "test-inv-001",
        amount: 1000.00,
        currency: "SAR",
        customerName: "Test Customer",
      },
    },
  };

  const dispatchedCount = await dispatchWebhook(testPayload);

  await logAudit({
    userEmail: user.email,
    userUid: user.uid,
    action: "webhook_test",
    entity: "webhook_endpoint",
    entityId: validation.data.endpointId,
    companySlug,
    details: { eventType: validation.data.eventType, dispatched: dispatchedCount },
  });

  return apiOk({
    dispatched: dispatchedCount,
    event: validation.data.eventType,
    payload: testPayload,
    message: dispatchedCount > 0
      ? `Test event dispatched to ${dispatchedCount} endpoint(s)`
      : "No active endpoints subscribed to this event",
  });
});
