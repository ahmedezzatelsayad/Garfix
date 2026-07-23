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
      case "success": return <CheckCircle2 size={14} style={{ color: "#22c55e" }} />;
      case "failed": return <XCircle size={14} style={{ color: "#ef4444" }} />;
      case "pending": return <Clock size={14} style={{ color: "#f59e0b" }} />;
      case "retried": return <AlertTriangle size={14} style={{ color: "#a855f7" }} />;
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

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: active ? 700 : 500,
    background: active ? "var(--accent)" : "transparent",
    color: active ? "var(--accent-foreground)" : "var(--muted-foreground)",
    cursor: "pointer",
    border: "none",
    transition: "all 0.2s",
  });

  const thStyle: React.CSSProperties = {
    textAlign: "right",
    padding: "10px 12px",
    fontSize: "11px",
    color: "var(--muted-foreground)",
    fontWeight: 700,
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: "13px",
  };

  const badgeStyle = (color: string): React.CSSProperties => ({
    padding: "2px 8px",
    borderRadius: "10px",
    background: color,
    color: "white",
    fontSize: "11px",
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: "24px", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
          <Webhook size={20} /> إدارة Webhooks
        </h1>
        <p style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>
          ربط الأحداث مع خدمات خارجية عبر نقاط ربط Webhook
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
        <button style={tabStyle(tab === "endpoints")} onClick={() => setTab("endpoints")}>
          <ExternalLink size={14} style={{ display: "inline", marginLeft: "4px" }} /> نقاط الربط ({endpoints.length})
        </button>
        <button style={tabStyle(tab === "deliveries")} onClick={() => setTab("deliveries")}>
          <Activity size={14} style={{ display: "inline", marginLeft: "4px" }} /> سجل التوصيل
        </button>
        <button style={tabStyle(tab === "events")} onClick={() => setTab("events")}>
          <Send size={14} style={{ display: "inline", marginLeft: "4px" }} /> الأحداث
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "12px", borderRadius: "8px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: "13px" }}>
          {error}
        </div>
      )}

      {/* ── Endpoints Tab ─────────────────────────────────────────────────── */}
      {tab === "endpoints" && (
        <>
          {/* Stats bar */}
          {stats && (
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ padding: "12px 16px", borderRadius: "10px", background: "var(--card)", border: "1px solid var(--border)", fontSize: "12px" }}>
                <span style={{ color: "var(--muted-foreground)" }}>معدل النجاح</span>
                <br />
                <strong style={{ fontSize: "18px", color: stats.successRate >= 80 ? "#22c55e" : stats.successRate >= 50 ? "#f59e0b" : "#ef4444" }}>
                  {stats.successRate}%
                </strong>
              </div>
              <div style={{ padding: "12px 16px", borderRadius: "10px", background: "var(--card)", border: "1px solid var(--border)", fontSize: "12px" }}>
                <span style={{ color: "var(--muted-foreground)" }}>متوسط التوصيل</span>
                <br />
                <strong style={{ fontSize: "18px" }}>{stats.avgLatencyMs}ms</strong>
              </div>
              <div style={{ padding: "12px 16px", borderRadius: "10px", background: "var(--card)", border: "1px solid var(--border)", fontSize: "12px" }}>
                <span style={{ color: "var(--muted-foreground)" }}>إجمالي التوصيلات</span>
                <br />
                <strong style={{ fontSize: "18px" }}>{stats.total}</strong>
              </div>
            </div>
          )}

          {/* Add button */}
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setFormUrl(""); setFormEvents([]); setFormActive(true); }}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", background: "var(--accent)", color: "var(--accent-foreground)", cursor: "pointer", border: "none", fontSize: "13px", fontWeight: 600 }}
          >
            <Plus size={14} /> إضافة نقطة ربط
          </button>

          {/* Add/Edit form */}
          {showForm && (
            <div style={{ padding: "16px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>
                {editingId ? "تعديل نقطة ربط" : "إضافة نقطة ربط جديدة"}
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <input
                  placeholder="URL (https://...)"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: "8px", background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "inherit", fontSize: "13px", direction: "ltr" }}
                  dir="ltr"
                />
                <div>
                  <label style={{ fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "4px" }}>الأحداث المشترك بها</label>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                    {events.length === 0 && <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>اضغط تبويب "الأحداث" لعرض الأحداث المتاحة</span>}
                    {events.filter((e) => e.id !== "*").map((evt) => (
                      <button
                        key={evt.id}
                        onClick={() => {
                          setFormEvents((prev) =>
                            prev.includes(evt.id) ? prev.filter((x) => x !== evt.id) : [...prev, evt.id]
                          );
                        }}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "8px",
                          fontSize: "11px",
                          border: "1px solid var(--border)",
                          background: formEvents.includes(evt.id) ? "var(--accent)" : "var(--background)",
                          color: formEvents.includes(evt.id) ? "var(--accent-foreground)" : "var(--foreground)",
                          cursor: "pointer",
                        }}
                      >
                        {evt.labelAr} ({evt.id})
                      </button>
                    ))}
                  </div>
                  {formEvents.length > 0 && (
                    <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--muted-foreground)" }}>
                      مشترك في {formEvents.length} حدث
                    </div>
                  )}
                </div>
                {editingId && (
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                    <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} />
                    نشط
                  </label>
                )}
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={handleSaveEndpoint}
                    style={{ padding: "8px 16px", borderRadius: "8px", background: "var(--accent)", color: "var(--accent-foreground)", cursor: "pointer", border: "none", fontSize: "13px", fontWeight: 600 }}
                  >
                    {editingId ? "تحديث" : "إضافة"}
                  </button>
                  <button
                    onClick={() => { setShowForm(false); setEditingId(null); }}
                    style={{ padding: "8px 16px", borderRadius: "8px", background: "var(--muted)", color: "var(--muted-foreground)", cursor: "pointer", border: "1px solid var(--border)", fontSize: "13px" }}
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Endpoint list */}
          <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>جارٍ التحميل…</div>
            ) : endpoints.length === 0 ? (
              <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>
                لا توجد نقاط ربط. اضغط "إضافة نقطة ربط" لإنشاء واحدة.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }} className="garfix-scroll">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--muted)" }}>
                      <th style={thStyle}>URL</th>
                      <th style={thStyle}>الأحداث</th>
                      <th style={thStyle}>الحالة</th>
                      <th style={thStyle}>تاريخ الإنشاء</th>
                      <th style={thStyle}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpoints.map((ep) => {
                      const parsedEvents: string[] = (() => { try { return JSON.parse(ep.events); } catch { return []; } })();
                      return (
                        <tr key={ep.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ ...tdStyle, direction: "ltr", fontFamily: "monospace", fontSize: "12px" }}>
                            {ep.url}
                          </td>
                          <td style={tdStyle}>
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                              {parsedEvents.map((evt) => (
                                <span key={evt} style={{ padding: "2px 6px", borderRadius: "6px", background: "var(--accent)", color: "var(--accent-foreground)", fontSize: "10px" }}>
                                  {evt}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td style={tdStyle}>
                            {ep.isActive ? (
                              <span style={badgeStyle("#22c55e")}>نشط</span>
                            ) : (
                              <span style={badgeStyle("#ef4444")}>معطل</span>
                            )}
                          </td>
                          <td style={{ ...tdStyle, fontSize: "12px" }}>
                            {new Date(ep.createdAt).toLocaleString("ar-EG")}
                          </td>
                          <td style={tdStyle}>
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button onClick={() => handleEditEndpoint(ep)} title="تعديل" style={{ padding: "4px 8px", borderRadius: "6px", cursor: "pointer", background: "var(--muted)", border: "1px solid var(--border)", fontSize: "12px" }}>
                                ✏️
                              </button>
                              <button onClick={() => handleDeleteEndpoint(ep.id)} title="حذف" style={{ padding: "4px 8px", borderRadius: "6px", cursor: "pointer", background: "#fef2f2", border: "1px solid #fecaca", fontSize: "12px", color: "#991b1b" }}>
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
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ padding: "12px 16px", borderRadius: "10px", background: "var(--card)", border: "1px solid var(--border)", fontSize: "12px" }}>
                <span style={{ color: "#22c55e" }}>✅ نجاح: {stats.succeeded}</span>
              </div>
              <div style={{ padding: "12px 16px", borderRadius: "10px", background: "var(--card)", border: "1px solid var(--border)", fontSize: "12px" }}>
                <span style={{ color: "#ef4444" }}>❌ فشل: {stats.failed}</span>
              </div>
              <div style={{ padding: "12px 16px", borderRadius: "10px", background: "var(--card)", border: "1px solid var(--border)", fontSize: "12px" }}>
                <span style={{ color: "#f59e0b" }}>⏳ قيد الانتظار: {stats.pending}</span>
              </div>
              <div style={{ padding: "12px 16px", borderRadius: "10px", background: "var(--card)", border: "1px solid var(--border)", fontSize: "12px" }}>
                <span style={{ color: "var(--muted-foreground)" }}>🔄 إعادة: {stats.retried}</span>
              </div>
              <div style={{ padding: "12px 16px", borderRadius: "10px", background: "var(--card)", border: "1px solid var(--border)", fontSize: "12px" }}>
                <span style={{ color: "var(--muted-foreground)" }}>⏱️ متوسط: {stats.avgLatencyMs}ms</span>
              </div>
              <div style={{ padding: "12px 16px", borderRadius: "10px", background: "var(--card)", border: "1px solid var(--border)", fontSize: "12px" }}>
                <span style={{ color: "var(--muted-foreground)" }}>📊 معدل النجاح: {stats.successRate}%</span>
              </div>
            </div>
          )}

          {/* Filters */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: "8px", background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "inherit", fontSize: "12px", cursor: "pointer" }}>
              <option value="">كل الحالات</option>
              <option value="success">نجاح</option>
              <option value="failed">فشل</option>
              <option value="pending">قيد الانتظار</option>
              <option value="retried">إعادة محاولة</option>
            </select>
            <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: "8px", background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "inherit", fontSize: "12px", cursor: "pointer" }}>
              <option value="">كل الأحداث</option>
              {events.filter((e) => e.id !== "*").map((evt) => (
                <option key={evt.id} value={evt.id}>{evt.labelAr} ({evt.id})</option>
              ))}
            </select>
            <select value={endpointFilter} onChange={(e) => setEndpointFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: "8px", background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "inherit", fontSize: "12px", cursor: "pointer" }}>
              <option value="">كل نقاط الربط</option>
              {endpoints.map((ep) => (
                <option key={ep.id} value={ep.id}>{ep.url}</option>
              ))}
            </select>
          </div>

          {/* Delivery table */}
          <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>جارٍ التحميل…</div>
            ) : deliveries.length === 0 ? (
              <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>لا توجد توصيلات</div>
            ) : (
              <div style={{ overflowX: "auto" }} className="garfix-scroll">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--muted)" }}>
                      <th style={thStyle}>الحالة</th>
                      <th style={thStyle}>الحدث</th>
                      <th style={thStyle}>نقطة الربط</th>
                      <th style={thStyle}>HTTP</th>
                      <th style={thStyle}>المحاولات</th>
                      <th style={thStyle}>الوقت</th>
                      <th style={thStyle}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d) => (
                      <tr key={d.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={tdStyle}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            {statusIcon(d.status)} {statusLabel(d.status)}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: "12px" }}>
                          <span style={{ padding: "2px 6px", borderRadius: "6px", background: "var(--accent)", color: "var(--accent-foreground)", fontSize: "10px" }}>
                            {d.eventType}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, direction: "ltr", fontFamily: "monospace", fontSize: "12px" }}>
                          {d.endpoint?.url || d.endpointId}
                        </td>
                        <td style={tdStyle}>
                          {d.statusCode ? (
                            <span style={{ color: d.statusCode < 300 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
                              {d.statusCode}
                            </span>
                          ) : "—"}
                        </td>
                        <td style={tdStyle}>
                          {d.attempts}/{d.maxAttempts}
                        </td>
                        <td style={{ ...tdStyle, fontSize: "12px" }}>
                          {new Date(d.createdAt).toLocaleString("ar-EG")}
                          {d.deliveredAt && (
                            <span style={{ color: "var(--muted-foreground)", fontSize: "10px" }}>
                              <br />توصيل: {new Date(d.deliveredAt).toLocaleString("ar-EG")}
                            </span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {(d.status === "failed" || d.status === "retried") && (
                            <button
                              onClick={() => handleRetry(d.id)}
                              title="إعادة محاولة"
                              style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", cursor: "pointer", background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: "11px", color: "#1d4ed8" }}
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
          <div style={{ padding: "16px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Send size={16} /> اختبار Webhook
            </h3>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <select
                value={testEndpointId}
                onChange={(e) => setTestEndpointId(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: "8px", background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "inherit", fontSize: "12px", flex: 1, minWidth: "200px" }}
              >
                <option value="">اختر نقطة ربط</option>
                {endpoints.map((ep) => (
                  <option key={ep.id} value={ep.id}>{ep.url}</option>
                ))}
              </select>
              <select
                value={testEventType}
                onChange={(e) => setTestEventType(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: "8px", background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "inherit", fontSize: "12px", flex: 1, minWidth: "200px" }}
              >
                {events.filter((e) => e.id !== "*").map((evt) => (
                  <option key={evt.id} value={evt.id}>{evt.labelAr} — {evt.id}</option>
                ))}
              </select>
              <button
                onClick={handleTestEvent}
                style={{ padding: "8px 16px", borderRadius: "8px", background: "var(--accent)", color: "var(--accent-foreground)", cursor: "pointer", border: "none", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Send size={14} /> إرسال تجريبي
              </button>
            </div>
            {testResult && (
              <div style={{ marginTop: "12px", padding: "8px 12px", borderRadius: "8px", background: "var(--background)", border: "1px solid var(--border)", fontSize: "13px" }}>
                {testResult}
              </div>
            )}
          </div>

          {/* Event types list */}
          <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>جارٍ التحميل…</div>
            ) : (
              <div style={{ overflowX: "auto" }} className="garfix-scroll">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--muted)" }}>
                      <th style={thStyle}>المعرّف</th>
                      <th style={thStyle}>الاسم</th>
                      <th style={thStyle}>الوصف</th>
                      <th style={thStyle}>المجموعة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((evt) => (
                      <tr key={evt.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "12px" }}>{evt.id}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{evt.labelAr}</td>
                        <td style={{ ...tdStyle, fontSize: "12px", color: "var(--muted-foreground)" }}>{evt.description}</td>
                        <td style={tdStyle}>
                          <span style={{ padding: "2px 6px", borderRadius: "6px", background: "var(--accent)", color: "var(--accent-foreground)", fontSize: "10px" }}>
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
