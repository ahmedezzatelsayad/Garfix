"use client";

import { useEffect, useState, useCallback } from "react";
import { authedFetch } from "@/context/AuthContext";
import { History } from "lucide-react";

interface AuditLog {
  id: number;
  userEmail: string;
  userUid: string;
  action: string;
  entity: string;
  entityId?: string | null;
  companySlug?: string | null;
  details?: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_FILTERS = ["", "create", "update", "delete", "login_success", "login_failure", "logout", "register", "payment", "status_change", "ai_chat"];

export function AuditView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set("action", actionFilter);
      if (companyFilter) params.set("companySlug", companyFilter);
      params.set("limit", "200");
      const res = await authedFetch(`/api/audit?${params.toString()}`);
      if (res.ok) setLogs((await res.json()).logs || []);
    } finally { setLoading(false); }
  }, [actionFilter, companyFilter]);

  // setState runs inside async .then() callback in load (after await authedFetch) — not synchronous in effect body; no cascading render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const th: React.CSSProperties = { textAlign: "right", padding: "10px 12px", fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 700 };
  const td: React.CSSProperties = { padding: "10px 12px", fontSize: "13px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <h1 style={{ fontSize: "24px", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}><History size={20} /> سجل التدقيق</h1>
        <p style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>{logs.length} سجل</p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: "8px", background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "inherit", fontSize: "12px", cursor: "pointer" }}>
          <option value="">كل الإجراءات</option>
          {ACTION_FILTERS.filter(Boolean).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input placeholder="فلترة بالشركة (slug)" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: "8px", background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "inherit", fontSize: "12px", outline: "none", flex: 1, minWidth: "180px" }} dir="ltr" />
      </div>

      <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
        {loading ? <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>جارٍ التحميل…</div> : logs.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>لا توجد سجلات</div>
        ) : (
          <div style={{ overflowX: "auto" }} className="garfix-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "var(--muted)" }}>
                <th style={th}>الوقت</th><th style={th}>المستخدم</th><th style={th}>الإجراء</th>
                <th style={th}>الكيان</th><th style={th}>المعرّف</th><th style={th}>الشركة</th>
              </tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={td}>{new Date(l.createdAt).toLocaleString("ar-EG")}</td>
                    <td style={{ ...td, direction: "ltr", textAlign: "right" }}>{l.userEmail}</td>
                    <td style={{ ...td, fontWeight: 700 }}>
                      <span style={{ padding: "2px 8px", borderRadius: "10px", background: "var(--accent)", color: "var(--accent-foreground)", fontSize: "11px" }}>{l.action}</span>
                    </td>
                    <td style={td}>{l.entity}</td>
                    <td style={{ ...td, fontFamily: "monospace" }}>{l.entityId || "—"}</td>
                    <td style={{ ...td, fontFamily: "monospace" }}>{l.companySlug || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AuditView;
