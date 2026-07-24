"use client";

/**
 * WebhookManagementView.tsx — Admin UI for webhook management.
 *
 * Features:
 *   - List endpoints with status (active/inactive)
 *   - Add/edit/delete endpoints
 *   - View delivery history with filtering
 *   - Retry failed deliveries
 *   - Test webhook with sample payload
 *   - Show delivery stats (success rate, avg latency)
 */

import { useEffect, useState, useCallback } from "react";
import { authedFetch } from "@/context/AuthContext";
import {
  Webhook, Activity, Plus, Trash2, RefreshCw, Send,
  CheckCircle2, XCircle, Clock, AlertTriangle, ExternalLink,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  secret: string | null;
}

interface WebhookDelivery {
  id: string;
  endpointId: string;
  eventType: string;
  status: "pending" | "success" | "failed" | "retried";
  statusCode: number | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  deliveredAt: string | null;
  nextRetryAt: string | null;
  endpoint?: { url: string; events: string };
}

interface DeliveryStats {
  total: number;
  succeeded: number;
  failed: number;
  pending: number;
  retried: number;
  successRate: number;
  avgLatencyMs: number;
}

interface EventType {
  id: string;
  label: string;
  labelAr: string;
  group: string;
  description: string;
}

// ── Component ────────────────────────────────────────────────────────────────

type Tab = "endpoints" | "deliveries" | "events";

export function WebhookManagementView() {
  const [tab, setTab] = useState<Tab>("endpoints");
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [events, setEvents] = useState<EventType[]>([]);
  const [stats, setStats] = useState<DeliveryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [eventFilter, setEventFilter] = useState<string>("");
  const [endpointFilter, setEndpointFilter] = useState<string>("");

  // Add/edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [formActive, setFormActive] = useState(true);

  // Test form
  const [testEndpointId, setTestEndpointId] = useState<string>("");
  const [testEventType, setTestEventType] = useState<string>("invoice.created");
  const [testResult, setTestResult] = useState<string | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadEndpoints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/webhooks/endpoints");
      if (!res.ok) throw new Error("Failed to load endpoints");
      const data = await res.json();
      setEndpoints(data.endpoints || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally { setLoading(false); }
  }, []);

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (eventFilter) params.set("eventType", eventFilter);
      if (endpointFilter) params.set("endpointId", endpointFilter);
      params.set("limit", "100");
      const res = await authedFetch(`/api/webhooks/deliveries?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load deliveries");
      const data = await res.json();
      setDeliveries(data.deliveries || []);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally { setLoading(false); }
  }, [statusFilter, eventFilter, endpointFilter]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/webhooks/events");
      if (!res.ok) throw new Error("Failed to load events");
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === "endpoints") loadEndpoints();
    else if (tab === "deliveries") loadDeliveries();
    else if (tab === "events") loadEvents();
  }, [tab, loadEndpoints, loadDeliveries, loadEvents]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleSaveEndpoint = async () => {
    if (!formUrl || formEvents.length === 0) {
      setError("URL and at least one event are required");
      return;
    }

    try {
      if (editingId) {
        // Update
        const res = await authedFetch(`/api/webhooks/endpoints/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": document.cookie.match(/inv_csrf=([^;]+)/)?.[1] || "" },
          body: JSON.stringify({ url: formUrl, events: formEvents, isActive: formActive }),
        });
        if (!res.ok) throw new Error("Failed to update endpoint");
      } else {
        // Create
        const res = await authedFetch("/api/webhooks/endpoints", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": document.cookie.match(/inv_csrf=([^;]+)/)?.[1] || "" },
          body: JSON.stringify({ url: formUrl, events: formEvents }),
        });
        if (!res.ok) throw new Error("Failed to create endpoint");
      }

      setShowForm(false);
      setEditingId(null);
      setFormUrl("");
      setFormEvents([]);
      setFormActive(true);
      loadEndpoints();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleDeleteEndpoint = async (id: string) => {
    if (!confirm("هل تريد حذف نقطة الربط هذه؟")) return;
    try {
      const res = await authedFetch(`/api/webhooks/endpoints/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": document.cookie.match(/inv_csrf=([^;]+)/)?.[1] || "" },
      });
      if (!res.ok) throw new Error("Failed to delete endpoint");
      loadEndpoints();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleRetry = async (deliveryId: string) => {
    try {
      const res = await authedFetch("/api/webhooks/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": document.cookie.match(/inv_csrf=([^;]+)/)?.[1] || "" },
        body: JSON.stringify({ deliveryId }),
      });
      if (!res.ok) throw new Error("Failed to retry delivery");
      loadDeliveries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleTestEvent = async () => {
    if (!testEndpointId || !testEventType) {
      setError("Select an endpoint and event type");
      return;
    }
    try {
      setTestResult(null);
      const res = await authedFetch("/api/webhooks/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": document.cookie.match(/inv_csrf=([^;]+)/)?.[1] || "" },
        body: JSON.stringify({ endpointId: testEndpointId, eventType: testEventType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to trigger test");
      setTestResult(`تم إرسال الحدث التجريبي إلى ${data.dispatched} نقطة ربط`);
    } catch (err) {
      setTestResult(`خطأ: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  };

  const handleEditEndpoint = (ep: WebhookEndpoint) => {
    setEditingId(ep.id);
    setFormUrl(ep.url);
    try {
      setFormEvents(JSON.parse(ep.events));
    } catch {
      setFormEvents([]);
    }
    setFormActive(ep.isActive);
    setShowForm(true);
  };

  // ── Status helpers ─────────────────────────────────────────────────────────

  const statusIcon = (status: string) => {
    switch (status) {
      case "success": return <CheckCircle2 size={14} className="text-green-500" />;
      case "failed": return <XCircle size={14} className="text-red-500" />;
      case "pending": return <Clock size={14} className="text-yellow-500" />;
      case "retried": return <AlertTriangle size={14} className="text-purple-500" />;
      default: return null;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "success": return "نجاح";
      case "failed": return "فشل";
      case "pending": return "قيد الانتظار";
      case "retried": return "إعادة محاولة";
      default: return status;
    }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────

  const tabClasses = (active: boolean): string =>
    `px-4 py-2 rounded-lg text-sm ${active ? "font-bold bg-[var(--accent)] text-[var(--accent-foreground)]" : "font-medium bg-transparent text-[var(--muted-foreground)]"} cursor-pointer border-0 transition-all duration-200`;

  const thClasses = "text-right py-2.5 px-3 text-xs text-[var(--muted-foreground)] font-bold";

  const tdClasses = "py-2.5 px-3 text-sm";

  const badgeClasses = (color: string): string =>
    `px-2 py-0.5 rounded-[10px] bg-[${color}] text-white text-xs font-semibold inline-flex items-center gap-1`;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* Header */}
      <div>
        <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold flex items-center gap-2">
          <Webhook size={20} /> إدارة Webhooks
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          ربط الأحداث مع خدمات خارجية عبر نقاط ربط Webhook
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 sm:gap-2 border-b border-[var(--border)] pb-2 overflow-x-auto">
        <button className={tabClasses(tab === "endpoints")} onClick={() => setTab("endpoints")}>
          <ExternalLink size={14} className="inline ml-1" /> نقاط الربط ({endpoints.length})
        </button>
        <button className={tabClasses(tab === "deliveries")} onClick={() => setTab("deliveries")}>
          <Activity size={14} className="inline ml-1" /> سجل التوصيل
        </button>
        <button className={tabClasses(tab === "events")} onClick={() => setTab("events")}>
          <Send size={14} className="inline ml-1" /> الأحداث
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* ── Endpoints Tab ─────────────────────────────────────────────────── */}
      {tab === "endpoints" && (
        <>
          {/* Stats bar */}
          {stats && (
            <div className="flex gap-2 sm:gap-3 flex-wrap">
              <div className="py-3 px-4 rounded-[10px] bg-[var(--card)] border border-[var(--border)] text-xs">
                <span className="text-[var(--muted-foreground)]">معدل النجاح</span>
                <br />
                <strong className={`text-lg ${stats.successRate >= 80 ? "text-green-500" : stats.successRate >= 50 ? "text-yellow-500" : "text-red-500"}`}>
                  {stats.successRate}%
                </strong>
              </div>
              <div className="py-3 px-4 rounded-[10px] bg-[var(--card)] border border-[var(--border)] text-xs">
                <span className="text-[var(--muted-foreground)]">متوسط التوصيل</span>
                <br />
                <strong className="text-lg">{stats.avgLatencyMs}ms</strong>
              </div>
              <div className="py-3 px-4 rounded-[10px] bg-[var(--card)] border border-[var(--border)] text-xs">
                <span className="text-[var(--muted-foreground)]">إجمالي التوصيلات</span>
                <br />
                <strong className="text-lg">{stats.total}</strong>
              </div>
            </div>
          )}

          {/* Add button */}
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setFormUrl(""); setFormEvents([]); setFormActive(true); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)] cursor-pointer border-0 text-sm font-semibold"
          >
            <Plus size={14} /> إضافة نقطة ربط
          </button>

          {/* Add/Edit form */}
          {showForm && (
            <div className="p-3 sm:p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
              <h3 className="text-base font-bold mb-3">
                {editingId ? "تعديل نقطة ربط" : "إضافة نقطة ربط جديدة"}
              </h3>
              <div className="flex flex-col gap-3">
                <input
                  placeholder="URL (https://...)"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-[inherit] text-sm"
                  dir="ltr"
                />
                <div>
                  <label className="text-xs text-[var(--muted-foreground)] mb-1">الأحداث المشترك بها</label>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {events.length === 0 && <span className="text-xs text-[var(--muted-foreground)]">اضغط تبويب "الأحداث" لعرض الأحداث المتاحة</span>}
                    {events.filter((e) => e.id !== "*").map((evt) => (
                      <button
                        key={evt.id}
                        onClick={() => {
                          setFormEvents((prev) =>
                            prev.includes(evt.id) ? prev.filter((x) => x !== evt.id) : [...prev, evt.id]
                          );
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs border border-[var(--border)] cursor-pointer ${formEvents.includes(evt.id) ? "bg-[var(--accent)] text-[var(--accent-foreground)]" : "bg-[var(--background)] text-[var(--foreground)]"}`}
                      >
                        {evt.labelAr} ({evt.id})
                      </button>
                    ))}
                  </div>
                  {formEvents.length > 0 && (
                    <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                      مشترك في {formEvents.length} حدث
                    </div>
                  )}
                </div>
                {editingId && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} />
                    نشط
                  </label>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEndpoint}
                    className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)] cursor-pointer border-0 text-sm font-semibold"
                  >
                    {editingId ? "تحديث" : "إضافة"}
                  </button>
                  <button
                    onClick={() => { setShowForm(false); setEditingId(null); }}
                    className="px-4 py-2 rounded-lg bg-[var(--muted)] text-[var(--muted-foreground)] cursor-pointer border border-[var(--border)] text-sm"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Endpoint list */}
          <div className="bg-[var(--card)] rounded-[14px] border border-[var(--border)] overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-[var(--muted-foreground)]">جارٍ التحميل…</div>
            ) : endpoints.length === 0 ? (
              <div className="p-12 text-center text-[var(--muted-foreground)]">
                لا توجد نقاط ربط. اضغط "إضافة نقطة ربط" لإنشاء واحدة.
              </div>
            ) : (
              <div className="overflow-x-auto garfix-scroll">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[var(--muted)]">
                      <th className={thClasses}>URL</th>
                      <th className={thClasses}>الأحداث</th>
                      <th className={thClasses}>الحالة</th>
                      <th className={`${thClasses} hidden md:table-cell`}>تاريخ الإنشاء</th>
                      <th className={thClasses}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpoints.map((ep) => {
                      const parsedEvents: string[] = (() => { try { return JSON.parse(ep.events); } catch { return []; } })();
                      return (
                        <tr key={ep.id} className="border-b border-[var(--border)]">
                          <td className="py-2.5 px-3 font-mono text-xs dir-ltr" dir="ltr">
                            {ep.url}
                          </td>
                          <td className={tdClasses}>
                            <div className="flex gap-1 flex-wrap">
                              {parsedEvents.map((evt) => (
                                <span key={evt} className="px-1.5 py-0.5 rounded-md bg-[var(--accent)] text-[var(--accent-foreground)] text-[10px]">
                                  {evt}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className={tdClasses}>
                            {ep.isActive ? (
                              <span className={badgeClasses("#22c55e")}>نشط</span>
                            ) : (
                              <span className={badgeClasses("#ef4444")}>معطل</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-xs hidden md:table-cell">
                            {new Date(ep.createdAt).toLocaleString("ar-EG")}
                          </td>
                          <td className={tdClasses}>
                            <div className="flex gap-1.5">
                              <button onClick={() => handleEditEndpoint(ep)} title="تعديل" className="px-2 py-1 rounded-md cursor-pointer bg-[var(--muted)] border border-[var(--border)] text-xs">
                                ✏️
                              </button>
                              <button onClick={() => handleDeleteEndpoint(ep.id)} title="حذف" className="px-2 py-1 rounded-md cursor-pointer bg-red-50 border border-red-200 text-xs text-red-800">
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Deliveries Tab ────────────────────────────────────────────────── */}
      {tab === "deliveries" && (
        <>
          {/* Stats */}
          {stats && (
            <div className="flex gap-2 sm:gap-3 flex-wrap">
              <div className="py-3 px-4 rounded-[10px] bg-[var(--card)] border border-[var(--border)] text-xs">
                <span className="text-green-500">✅ نجاح: {stats.succeeded}</span>
              </div>
              <div className="py-3 px-4 rounded-[10px] bg-[var(--card)] border border-[var(--border)] text-xs">
                <span className="text-red-500">❌ فشل: {stats.failed}</span>
              </div>
              <div className="py-3 px-4 rounded-[10px] bg-[var(--card)] border border-[var(--border)] text-xs">
                <span className="text-yellow-500">⏳ قيد الانتظار: {stats.pending}</span>
              </div>
              <div className="py-3 px-4 rounded-[10px] bg-[var(--card)] border border-[var(--border)] text-xs">
                <span className="text-[var(--muted-foreground)]">🔄 إعادة: {stats.retried}</span>
              </div>
              <div className="py-3 px-4 rounded-[10px] bg-[var(--card)] border border-[var(--border)] text-xs">
                <span className="text-[var(--muted-foreground)]">⏱️ متوسط: {stats.avgLatencyMs}ms</span>
              </div>
              <div className="py-3 px-4 rounded-[10px] bg-[var(--card)] border border-[var(--border)] text-xs">
                <span className="text-[var(--muted-foreground)]">📊 معدل النجاح: {stats.successRate}%</span>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2 sm:gap-3 flex-wrap">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] font-[inherit] text-xs cursor-pointer">
              <option value="">كل الحالات</option>
              <option value="success">نجاح</option>
              <option value="failed">فشل</option>
              <option value="pending">قيد الانتظار</option>
              <option value="retried">إعادة محاولة</option>
            </select>
            <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] font-[inherit] text-xs cursor-pointer">
              <option value="">كل الأحداث</option>
              {events.filter((e) => e.id !== "*").map((evt) => (
                <option key={evt.id} value={evt.id}>{evt.labelAr} ({evt.id})</option>
              ))}
            </select>
            <select value={endpointFilter} onChange={(e) => setEndpointFilter(e.target.value)} className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] font-[inherit] text-xs cursor-pointer">
              <option value="">كل نقاط الربط</option>
              {endpoints.map((ep) => (
                <option key={ep.id} value={ep.id}>{ep.url}</option>
              ))}
            </select>
          </div>

          {/* Delivery table */}
          <div className="bg-[var(--card)] rounded-[14px] border border-[var(--border)] overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-[var(--muted-foreground)]">جارٍ التحميل…</div>
            ) : deliveries.length === 0 ? (
              <div className="p-12 text-center text-[var(--muted-foreground)]">لا توجد توصيلات</div>
            ) : (
              <div className="overflow-x-auto garfix-scroll">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[var(--muted)]">
                      <th className={thClasses}>الحالة</th>
                      <th className={thClasses}>الحدث</th>
                      <th className={thClasses}>نقطة الربط</th>
                      <th className={thClasses}>HTTP</th>
                      <th className={`${thClasses} hidden md:table-cell`}>المحاولات</th>
                      <th className={thClasses}>الوقت</th>
                      <th className={thClasses}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d) => (
                      <tr key={d.id} className="border-b border-[var(--border)]">
                        <td className={tdClasses}>
                          <span className="inline-flex items-center gap-1">
                            {statusIcon(d.status)} {statusLabel(d.status)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-xs">
                          <span className="px-1.5 py-0.5 rounded-md bg-[var(--accent)] text-[var(--accent-foreground)] text-[10px]">
                            {d.eventType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs" dir="ltr">
                          {d.endpoint?.url || d.endpointId}
                        </td>
                        <td className={tdClasses}>
                          {d.statusCode ? (
                            <span className={`font-bold ${d.statusCode < 300 ? "text-green-500" : "text-red-500"}`}>
                              {d.statusCode}
                            </span>
                          ) : "—"}
                        </td>
                        <td className={`${tdClasses} hidden md:table-cell`}>
                          {d.attempts}/{d.maxAttempts}
                        </td>
                        <td className="py-2.5 px-3 text-xs">
                          {new Date(d.createdAt).toLocaleString("ar-EG")}
                          {d.deliveredAt && (
                            <span className="text-[var(--muted-foreground)] text-[10px]">
                              <br />توصيل: {new Date(d.deliveredAt).toLocaleString("ar-EG")}
                            </span>
                          )}
                        </td>
                        <td className={tdClasses}>
                          {(d.status === "failed" || d.status === "retried") && (
                            <button
                              onClick={() => handleRetry(d.id)}
                              title="إعادة محاولة"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer bg-blue-50 border border-blue-200 text-xs text-blue-700"
                            >
                              <RefreshCw size={12} /> إعادة
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Events Tab ───────────────────────────────────────────────────── */}
      {tab === "events" && (
        <>
          {/* Test webhook */}
          <div className="p-3 sm:p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
            <h3 className="text-base font-bold mb-3 flex items-center gap-2">
              <Send size={16} /> اختبار Webhook
            </h3>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <select
                value={testEndpointId}
                onChange={(e) => setTestEndpointId(e.target.value)}
                className="px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-[inherit] text-xs flex-1 min-w-[200px]"
              >
                <option value="">اختر نقطة ربط</option>
                {endpoints.map((ep) => (
                  <option key={ep.id} value={ep.id}>{ep.url}</option>
                ))}
              </select>
              <select
                value={testEventType}
                onChange={(e) => setTestEventType(e.target.value)}
                className="px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-[inherit] text-xs flex-1 min-w-[200px]"
              >
                {events.filter((e) => e.id !== "*").map((evt) => (
                  <option key={evt.id} value={evt.id}>{evt.labelAr} — {evt.id}</option>
                ))}
              </select>
              <button
                onClick={handleTestEvent}
                className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)] cursor-pointer border-0 text-sm font-semibold flex items-center gap-1.5"
              >
                <Send size={14} /> إرسال تجريبي
              </button>
            </div>
            {testResult && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-sm">
                {testResult}
              </div>
            )}
          </div>

          {/* Event types list */}
          <div className="bg-[var(--card)] rounded-[14px] border border-[var(--border)] overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-[var(--muted-foreground)]">جارٍ التحميل…</div>
            ) : (
              <div className="overflow-x-auto garfix-scroll">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[var(--muted)]">
                      <th className={thClasses}>المعرّف</th>
                      <th className={thClasses}>الاسم</th>
                      <th className={`${thClasses} hidden md:table-cell`}>الوصف</th>
                      <th className={thClasses}>المجموعة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((evt) => (
                      <tr key={evt.id} className="border-b border-[var(--border)]">
                        <td className="py-2.5 px-3 font-mono text-xs">{evt.id}</td>
                        <td className="py-2.5 px-3 font-semibold">{evt.labelAr}</td>
                        <td className="py-2.5 px-3 text-xs text-[var(--muted-foreground)] hidden md:table-cell">{evt.description}</td>
                        <td className={tdClasses}>
                          <span className="px-1.5 py-0.5 rounded-md bg-[var(--accent)] text-[var(--accent-foreground)] text-[10px]">
                            {evt.group}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default WebhookManagementView;
