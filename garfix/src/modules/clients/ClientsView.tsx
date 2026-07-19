"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus, Search, Users, Trash2, Edit2, X, Eye, Download, Upload, ChevronLeft } from "lucide-react";
import { ClientProfile } from "./ClientProfile";
import { cn } from "@/lib/utils";

interface Client {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  notes?: string;
  companySlug: string;
}

export function ClientsView() {
  const { activeCompany } = useBrand();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const pageSize = 20;

  const load = useCallback(async () => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    try {
      const url = `/api/clients?companySlug=${encodeURIComponent(activeCompany.slug)}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
      const res = await authedFetch(url);
      if (res.ok) {
        setClients((await res.json()).clients || []);
        setCurrentPage(1);
        setSelectedIds(new Set());
      } else {
        // P2 fix (Phase 2 audit): previously silently swallowed non-OK responses,
        // leaving the user staring at the empty state with no explanation.
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "تعذّر تحميل العملاء");
      }
    } catch {
      // Network / abort error — same fix: surface to the user.
      toast.error("تعذّر الاتصال بالخادم");
    } finally { setLoading(false); }
  }, [activeCompany, search]);

  // setState runs inside async .then() callback in load (after await authedFetch) — not synchronous in effect body; no cascading render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Reset page when search changes (render-time adjustment, no cascading render).
  const [prevSearch, setPrevSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    setCurrentPage(1);
  }

  // Listen for quick-action events from the Command Palette (e.g. "عميل جديد")
  useEffect(() => {
    const onQuickAction = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type?: string } | undefined;
      if (detail?.type === "new-client") {
        setEditing(null);
        setShowForm(true);
      }
    };
    window.addEventListener("garfix:quick-action", onQuickAction as EventListener);
    return () => window.removeEventListener("garfix:quick-action", onQuickAction as EventListener);
  }, []);

  const totalPages = Math.max(1, Math.ceil(clients.length / pageSize));
  const currentPageClients = clients.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const safePage = Math.min(currentPage, totalPages);

  const toggleSelectAll = () => {
    if (selectedIds.size === currentPageClients.length && currentPageClients.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentPageClients.map((c) => c.id)));
    }
  };

  const toggleRow = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`هل أنت متأكد من حذف ${selectedIds.size} عميل؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setBulkDeleting(true);
    let okCount = 0;
    let failCount = 0;
    for (const id of selectedIds) {
      try {
        const res = await authedFetch(`/api/clients/${id}`, { method: "DELETE" });
        if (res.ok) okCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (okCount > 0) toast.success(`تم حذف ${okCount} عميل بنجاح`);
    if (failCount > 0) toast.error(`تعذّر حذف ${failCount} عميل`);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("حذف هذا العميل؟")) return;
    const res = await authedFetch(`/api/clients/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("تم الحذف"); load(); }
  };

  const handleExportCSV = async () => {
    if (!activeCompany) return;
    try {
      const res = await authedFetch(`/api/clients?companySlug=${encodeURIComponent(activeCompany.slug)}`);
      if (!res.ok) { toast.error("تعذّر جلب العملاء"); return; }
      const data = await res.json();
      const rows: Client[] = data.clients || [];
      const header = ["name", "email", "phone", "company", "address"];
      const csvLines = [header.join(",")];
      for (const c of rows) {
        const line = [c.name, c.email || "", c.phone || "", c.company || "", c.address || ""]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
        csvLines.push(line);
      }
      const csv = "\uFEFF" + csvLines.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clients-${activeCompany.slug}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`تم تصدير ${rows.length} عميل`);
    } catch {
      toast.error("تعذّر التصدير");
    }
  };

  if (!activeCompany) return <div className="p-12 text-center text-muted-foreground">اختر شركة</div>;

  if (selectedClientId !== null) {
    return (
      <ClientProfile
        clientId={selectedClientId}
        onBack={() => setSelectedClientId(null)}
      />
    );
  }

  if (showForm || editing) {
    return (
      <ClientForm
        company={activeCompany}
        editing={editing}
        onClose={() => { setShowForm(false); setEditing(null); }}
        onSaved={() => { setShowForm(false); setEditing(null); load(); }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Title + primary action — stack vertically on mobile, row on desktop */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">العملاء</h1>
          <p className="text-[13px] text-gray-500">{clients.length} عميل</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center justify-center gap-1.5 py-2.5 px-[18px] rounded-[10px] bg-[#7C3AED] text-white border-none text-[13px] font-bold cursor-pointer max-md:min-h-[44px] shadow-[0_2px_8px_rgba(124,58,237,0.3)]"
        >
          <Plus size={16} /> عميل جديد
        </button>
      </div>

      {/* Filter / action bar — stack on mobile, row on desktop */}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-[10px] bg-white text-foreground border border-gray-200 text-[12px] font-bold cursor-pointer max-md:min-h-[44px] hover:bg-[#F5F3FF] hover:border-[#EDE9FE] transition-colors"
          >
            <Download size={14} /> تصدير CSV
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-[10px] bg-white text-foreground border border-gray-200 text-[12px] font-bold cursor-pointer max-md:min-h-[44px] hover:bg-[#F5F3FF] hover:border-[#EDE9FE] transition-colors"
          >
            <Upload size={14} /> استيراد CSV
          </button>
        </div>
        <div className="relative flex-1 md:min-w-[260px]">
          <Search
            size={16}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            placeholder="بحث بالاسم أو البريد أو الهاتف…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full py-2.5 px-10 rounded-[10px] bg-white border border-gray-200 text-foreground text-[13px] outline-none max-md:min-h-[44px] focus:border-[#7C3AED]/50 focus:ring-1 focus:ring-[#EDE9FE]"
          />
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="py-2.5 px-4 bg-destructive text-white rounded-[10px] flex flex-wrap justify-between items-center gap-2">
          <span className="font-bold text-[13px]">{selectedIds.size} عميل محدد</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkDeleting}
              className="bg-white/15 text-white border-none rounded-[6px] py-1.5 px-3.5 text-[12px] font-bold cursor-pointer disabled:cursor-not-allowed"
            >إلغاء التحديد</button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-white/25 text-white border-none rounded-[6px] py-1.5 px-3.5 text-[12px] font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
            >{bulkDeleting ? "جارٍ الحذف…" : "حذف المحدد"}</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[14px] border border-gray-200 overflow-hidden shadow-card">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div>
        ) : clients.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Users size={36} className="opacity-30 mb-2 mx-auto" />
            <div>لا يوجد عملاء بعد</div>
          </div>
        ) : (
          <>
          {/* Desktop / tablet table */}
          <div className="hidden md:block overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="w-10 text-center py-2.5 px-2 text-[11px] text-gray-500">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === currentPageClients.length && currentPageClients.length > 0}
                      onChange={toggleSelectAll}
                      className="cursor-pointer w-4 h-4 accent-[#7C3AED]"
                      aria-label="تحديد الكل"
                    />
                  </th>
                  <th className="text-start py-2.5 px-3 text-[11px] text-gray-500">الاسم</th>
                  <th className="text-start py-2.5 px-3 text-[11px] text-gray-500">البريد</th>
                  <th className="text-start py-2.5 px-3 text-[11px] text-gray-500">الهاتف</th>
                  <th className="text-start py-2.5 px-3 text-[11px] text-gray-500">الشركة</th>
                  <th className="text-start py-2.5 px-3 text-[11px] text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {currentPageClients.map((c) => {
                  const checked = selectedIds.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedClientId(c.id)}
                      className={cn(
                        "border-b border-gray-100 cursor-pointer transition-colors duration-100",
                        checked ? "bg-[#F5F3FF]" : "bg-transparent hover:bg-[#F5F3FF]/50",
                      )}
                    >
                      <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(c.id)}
                          className="cursor-pointer w-4 h-4"
                          aria-label={`تحديد العميل ${c.name}`}
                        />
                      </td>
                      <td className="py-2.5 px-3 font-bold">{c.name}</td>
                      <td className="py-2.5 px-3 [direction:ltr] text-end">{c.email || "—"}</td>
                      <td className="py-2.5 px-3 [direction:ltr] text-end">{c.phone || "—"}</td>
                      <td className="py-2.5 px-3">{c.company || "—"}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedClientId(c.id); }}
                            title="عرض الملف"
                            className="w-7 h-7 rounded-[6px] bg-transparent border border-gray-200 text-[#7C3AED] cursor-pointer flex items-center justify-center hover:bg-[#F5F3FF] hover:border-[#EDE9FE] transition-colors"
                          ><Eye size={14} /></button>
                          <button onClick={(e) => { e.stopPropagation(); setEditing(c); }} title="تعديل" className="w-7 h-7 rounded-[6px] bg-transparent border border-gray-200 text-gray-400 cursor-pointer flex items-center justify-center hover:bg-[#F5F3FF] hover:border-[#EDE9FE] transition-colors"><Edit2 size={14} /></button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} title="حذف" className="w-7 h-7 rounded-[6px] bg-transparent border border-gray-200 text-destructive cursor-pointer flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile compact list — 2-line items, tap to open detail.
              Actions live in the detail panel (opened via setSelectedClientId). */}
          <div className="md:hidden flex flex-col divide-y divide-border" style={{ paddingBottom: "var(--ai-bubble-safe-area)" }}>
            {currentPageClients.map((c) => {
              const checked = selectedIds.has(c.id);
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedClientId(c.id)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors duration-100 min-h-[56px]",
                    checked ? "bg-[#F5F3FF]" : "bg-white hover:bg-[#F5F3FF]/50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRow(c.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-pointer w-4 h-4 shrink-0"
                    aria-label={`تحديد العميل ${c.name}`}
                  />
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="font-bold text-[14px] truncate leading-tight">{c.name}</span>
                    <span className="text-[12px] text-muted-foreground truncate leading-tight">
                      {c.company ? `${c.company} · ` : ""}<span className="[direction:ltr] inline-block">{c.phone || c.email || "—"}</span>
                    </span>
                  </div>
                  <ChevronLeft size={18} className="text-muted-foreground shrink-0" />
                </div>
              );
            })}
          </div>

          {/* Pagination footer */}
          <div className="flex flex-wrap justify-between items-center py-3 px-4 border-t border-border gap-2">
            <span className="text-[12px] text-muted-foreground">
              عرض {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, clients.length)} من {clients.length} عميل
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className={pageBtnStyle(safePage === 1)}>السابق</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && p - prev > 1;
                  return (
                    <span key={p} className="inline-flex items-center">
                      {showEllipsis && <span className="px-1 text-muted-foreground text-[12px]">…</span>}
                      <button onClick={() => setCurrentPage(p)} className={pageNumStyle(p === safePage)}>{p}</button>
                    </span>
                  );
                })}
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className={pageBtnStyle(safePage === totalPages)}>التالي</button>
            </div>
          </div>
          </>
        )}
      </div>
      {showImport && (
        <ImportCSVDialog
          companySlug={activeCompany.slug}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load(); }}
        />
      )}
    </div>
  );
}

function ImportCSVDialog({ companySlug, onClose, onImported }: { companySlug: string; onClose: () => void; onImported: () => void }) {
  const [parsed, setParsed] = useState<Array<{ name: string; email: string; phone: string; company: string; address: string }>>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "").replace(/^\uFEFF/, "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length === 0) { toast.error("الملف فارغ"); return; }
      // First line is header — accept any order, but we expect columns:
      // name,email,phone,company,address
      const headerCells = lines[0].split(",").map((s) => s.trim().toLowerCase().replace(/^"|"$/g, ""));
      const idx = {
        name: headerCells.indexOf("name"),
        email: headerCells.indexOf("email"),
        phone: headerCells.indexOf("phone"),
        company: headerCells.indexOf("company"),
        address: headerCells.indexOf("address"),
      };
      const rows: Array<{ name: string; email: string; phone: string; company: string; address: string }> = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = parseCsvLine(lines[i]);
        const name = idx.name >= 0 ? cells[idx.name] : cells[0];
        if (!name) continue;
        rows.push({
          name,
          email: idx.email >= 0 ? cells[idx.email] || "" : "",
          phone: idx.phone >= 0 ? cells[idx.phone] || "" : "",
          company: idx.company >= 0 ? cells[idx.company] || "" : "",
          address: idx.address >= 0 ? cells[idx.address] || "" : "",
        });
      }
      setParsed(rows);
      toast.success(`تم تحليل ${rows.length} صف`);
    };
    reader.readAsText(f);
  };

  const runImport = async () => {
    if (parsed.length === 0) { toast.error("لا توجد بيانات للاستيراد"); return; }
    setImporting(true);
    let okCount = 0, failCount = 0;
    for (const row of parsed) {
      try {
        const res = await authedFetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...row, companySlug }),
        });
        if (res.ok) okCount++; else failCount++;
      } catch { failCount++; }
    }
    setImporting(false);
    if (okCount > 0) toast.success(`تم استيراد ${okCount} عميل`);
    if (failCount > 0) toast.error(`تعذّر استيراد ${failCount} صف`);
    onImported();
  };

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/55 backdrop-blur-[4px] z-[1000] flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full md:max-w-[720px] max-h-[90vh] overflow-y-auto bg-white border border-gray-200 rounded-[16px] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.15)] garfix-scroll">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-[16px] font-extrabold flex items-center gap-2">
            <Upload size={18} /> استيراد عملاء من CSV
          </h2>
          <button onClick={onClose} className="bg-transparent border-none text-muted-foreground cursor-pointer p-1 max-md:min-w-[44px] max-md:min-h-[44px] flex items-center justify-center">
            <X size={18} />
          </button>
        </div>
        <div className="py-2.5 px-3 bg-gray-50 border border-gray-200 rounded-[10px] text-[11px] text-gray-500 mb-3">
          تنسيق الملف: عمود رأس باسم name,email,phone,company,address — ثم صف لكل عميل.
        </div>
        <input type="file" accept=".csv" onChange={onFile} className="mb-3 font-sans text-[12px]" />
        {fileName && (
          <div className="text-[11px] text-muted-foreground mb-2">الملف: {fileName}</div>
        )}
        {parsed.length > 0 && (
          <>
            <div className="text-[12px] font-bold mb-1.5">
              معاينة ({parsed.length} صف)
            </div>
            <div className="max-h-[280px] overflow-y-auto border border-gray-200 rounded-[8px] mb-3 garfix-scroll">
              <table className="w-full border-collapse text-[12px]">
                <thead><tr className="bg-gray-50 sticky top-0">
                  <th className={thSm}>الاسم</th><th className={thSm}>البريد</th><th className={thSm}>الهاتف</th><th className={thSm}>الشركة</th>
                </tr></thead>
                <tbody>
                  {parsed.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className={tdSm}>{r.name}</td>
                      <td className={cn(tdSm, "[direction:ltr] text-end")}>{r.email || "—"}</td>
                      <td className={cn(tdSm, "[direction:ltr] text-end")}>{r.phone || "—"}</td>
                      <td className={tdSm}>{r.company || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="flex gap-2.5 justify-end">
          <button onClick={onClose} className="py-2.5 px-5 rounded-[10px] bg-transparent text-gray-400 border border-gray-200 text-[13px] font-bold cursor-pointer max-md:min-h-[44px]">إلغاء</button>
          <button onClick={runImport} disabled={importing || parsed.length === 0} className="py-2.5 px-6 rounded-[10px] bg-[#7C3AED] text-white border-none text-[13px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px] shadow-[0_2px_8px_rgba(124,58,237,0.3)]">
            {importing ? "جارٍ الاستيراد…" : `استيراد ${parsed.length} عميل`}
          </button>
        </div>
      </div>
    </div>
  );
}

const thSm = "text-start py-1.5 px-2 text-[10px] text-gray-500 font-bold";
const tdSm = "py-1.5 px-2 text-[12px]";

/** Parse a single CSV line — handles quoted fields with embedded commas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === ',') { out.push(cur.trim()); cur = ""; }
      else if (ch === '"') inQ = true;
      else cur += ch;
    }
  }
  out.push(cur.trim());
  // strip surrounding quotes from each cell
  return out.map((c) => c.replace(/^"|"$/g, ""));
}

function ClientForm({ company, editing, onClose, onSaved }: { company: { slug: string }; editing: Client | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editing?.name || "");
  const [email, setEmail] = useState(editing?.email || "");
  const [phone, setPhone] = useState(editing?.phone || "");
  const [companyName, setCompanyName] = useState(editing?.company || "");
  const [address, setAddress] = useState(editing?.address || "");
  const [notes, setNotes] = useState(editing?.notes || "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name) { toast.error("الاسم مطلوب"); return; }
    setSaving(true);
    try {
      const url = editing ? `/api/clients/${editing.id}` : "/api/clients";
      const method = editing ? "PATCH" : "POST";
      const res = await authedFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, company: companyName, address, notes, companySlug: company.slug }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      toast.success(editing ? "تم التحديث" : "تم الإنشاء");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="text-[22px] font-extrabold">{editing ? "تعديل عميل" : "عميل جديد"}</h1>
        <button onClick={onClose} className="bg-transparent border border-gray-200 text-gray-400 py-2 px-3 rounded-[8px] cursor-pointer text-[12px] inline-flex items-center gap-1 max-md:min-h-[44px]"><X size={14} /> إغلاق</button>
      </div>
      <div className="bg-white rounded-[14px] border border-gray-200 p-5 flex flex-col gap-3.5 shadow-card">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="الاسم"><input value={name} onChange={(e) => setName(e.target.value)} className={inputStyle} /></Field>
          <Field label="البريد الإلكتروني"><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputStyle} dir="ltr" /></Field>
          <Field label="الهاتف"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputStyle} dir="ltr" /></Field>
          <Field label="اسم الشركة"><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputStyle} /></Field>
        </div>
        <Field label="العنوان"><input value={address} onChange={(e) => setAddress(e.target.value)} className={inputStyle} /></Field>
        <Field label="ملاحظات"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={cn(inputStyle, "resize-y")} /></Field>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-[10px] bg-transparent text-gray-400 border border-gray-200 text-[13px] font-bold cursor-pointer max-md:min-h-[44px]">إلغاء</button>
        <button onClick={submit} disabled={saving} className="py-2.5 px-6 rounded-[10px] bg-[#7C3AED] text-white border-none text-[13px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px] shadow-[0_2px_8px_rgba(124,58,237,0.3)]">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputStyle = "w-full py-2 px-3 rounded-sm bg-white border border-gray-200 text-foreground text-[13px] outline-none focus:border-[#7C3AED]/50 focus:ring-1 focus:ring-[#EDE9FE]";

const pageBtnStyle = (disabled: boolean): string =>
  disabled
    ? "py-1.5 px-3 rounded-[6px] bg-transparent text-gray-400 border border-gray-200 text-[12px] font-bold cursor-not-allowed opacity-50"
    : "py-1.5 px-3 rounded-[6px] bg-white text-foreground border border-gray-200 text-[12px] font-bold cursor-pointer";

const pageNumStyle = (active: boolean): string =>
  active
    ? "min-w-[32px] py-1.5 px-2 rounded-[6px] bg-[#7C3AED] text-white border border-[#7C3AED] text-[12px] font-bold cursor-pointer transition-all duration-150"
    : "min-w-[32px] py-1.5 px-2 rounded-[6px] bg-transparent text-foreground border border-gray-200 text-[12px] font-bold cursor-pointer transition-all duration-150";

export default ClientsView;
