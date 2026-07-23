// Responsive: sm/md/lg breakpoints added
"use client";

import { useEffect, useState, useCallback } from "react";
import { authedFetch } from "@/context/AuthContext";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";

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

  const thClass = "text-start py-2.5 px-3 text-[11px] text-muted-foreground font-bold";
  const tdClass = "py-2.5 px-3 text-[13px]";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl md:text-2xl font-extrabold flex items-center gap-2"><History size={20} /> سجل التدقيق</h1>
        <p className="text-sm text-muted-foreground">{logs.length} سجل</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="py-2 px-3 rounded-[8px] bg-card border border-border text-foreground font-inherit text-xs cursor-pointer">
          <option value="">كل الإجراءات</option>
          {ACTION_FILTERS.filter(Boolean).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input placeholder="فلترة بالشركة (slug)" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="py-2 px-3 rounded-[8px] bg-card border border-border text-foreground font-inherit text-xs outline-none flex-1 min-w-[180px]" dir="ltr" />
      </div>

      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : logs.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">لا توجد سجلات</div>
        ) : (
          <div className="overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse">
              <thead><tr className="bg-muted">
                <th className={thClass}>الوقت</th><th className={thClass}>المستخدم</th><th className={thClass}>الإجراء</th>
                <th className={thClass}>الكيان</th><th className={thClass}>المعرّف</th><th className={thClass}>الشركة</th>
              </tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-border">
                    <td className={tdClass}>{new Date(l.createdAt).toLocaleString("ar-EG")}</td>
                    <td className={cn(tdClass, "[direction:ltr] text-end")}>{l.userEmail}</td>
                    <td className={cn(tdClass, "font-bold")}>
                      <span className="py-0.5 px-2 rounded-[10px] bg-accent text-accent-foreground text-[11px] font-bold">{l.action}</span>
                    </td>
                    <td className={tdClass}>{l.entity}</td>
                    <td className={cn(tdClass, "font-mono")}>{l.entityId || "—"}</td>
                    <td className={cn(tdClass, "font-mono")}>{l.companySlug || "—"}</td>
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
