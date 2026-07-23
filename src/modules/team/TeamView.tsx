"use client";

/**
 * TeamView — "My Team" page (hash route: #team)
 *
 * Lists company members, lets admins invite new members by email, edit each
 * member's role + per-permission toggles, and remove members (without deleting
 * the underlying user account).
 *
 * Backend: /api/companies/[slug]/members (GET/POST) and
 *          /api/companies/[slug]/members/[uid] (PATCH/DELETE)
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Users, Trash2, Edit2, X, Mail, Crown, UserPlus, Key,
} from "lucide-react";
import {
  PERMISSION_CATALOG, ROLE_PRESETS, LOCKED_PERMS,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface Member {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  companies: string[];
  permissions: Record<string, number>;
  isFounder?: boolean;
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = ROLE_PRESETS.reduce(
  (acc, r) => {
    acc[r.value] = r.label;
    return acc;
  },
  { admin: "مدير 👑", editor: "وصول كامل ✏️", employee: "موظف طلبات 👤", viewer: "عرض فقط 👁️" } as Record<string, string>,
);

function roleColor(role: string): string {
  const preset = ROLE_PRESETS.find((r) => r.value === role);
  return preset?.color || "#6b7280";
}

/** Build a short text summary of a member's permissions for the table. */
function permSummary(perms: Record<string, number>, role: string, isFounder?: boolean): string {
  if (isFounder || role === "admin") return "كل الصلاحيات";
  const enabled = PERMISSION_CATALOG.filter((p) => !p.locked && perms[p.key]);
  if (enabled.length === 0) return "بدون صلاحيات";
  if (enabled.length === PERMISSION_CATALOG.filter((p) => !p.locked).length) return "كل الصلاحيات (غير الإدارية)";
  return `${enabled.length} صلاحية`;
}

const inputStyle = "w-full py-[9px] px-3 rounded-sm bg-background border border-border text-foreground text-[13px] outline-none max-md:min-h-[44px]";
const labelStyle = "block text-[11px] font-semibold text-muted-foreground mb-1";
const thStyle = "text-start px-3 py-2.5 text-[11px] text-muted-foreground font-semibold";
const tdStyle = "px-3 py-2.5 align-middle";
const iconBtn = "w-7 h-7 rounded-sm bg-transparent border border-border text-muted-foreground cursor-pointer flex items-center justify-center";
const primaryBtn = "px-6 py-2.5 rounded-md bg-primary text-primary-foreground border-none font-extrabold text-[13px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px]";
const ghostBtn = "px-5 py-2.5 rounded-md bg-transparent text-muted-foreground border border-border font-bold text-[13px] cursor-pointer max-md:min-h-[44px]";

export function TeamView() {
  const { activeCompany } = useBrand();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const pageSize = 20;

  const load = useCallback(async () => {
    if (!activeCompany) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await authedFetch(`/api/companies/${activeCompany.slug}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
        setCurrentPage(1);
        setSelectedIds(new Set());
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "تعذّر تحميل الأعضاء");
      }
    } finally { setLoading(false); }
  }, [activeCompany]);

  // setState runs inside async .then() callback in load (after await authedFetch) — not synchronous in effect body; no cascading render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(members.length / pageSize));
  const pageMembers = members.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const safePage = Math.min(currentPage, totalPages);

  const toggleSelectAll = () => {
    if (selectedIds.size === pageMembers.length && pageMembers.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(pageMembers.map((m) => m.uid)));
  };
  const toggleRow = (uid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (!activeCompany || selectedIds.size === 0) return;
    if (!confirm(`إزالة ${selectedIds.size} عضو من الشركة؟`)) return;
    setBulkDeleting(true);
    let okCount = 0, failCount = 0;
    for (const uid of selectedIds) {
      try {
        const res = await authedFetch(`/api/companies/${activeCompany.slug}/members/${uid}`, { method: "DELETE" });
        if (res.ok) okCount++; else failCount++;
      } catch { failCount++; }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (okCount > 0) toast.success(`تمت إزالة ${okCount} عضو`);
    if (failCount > 0) toast.error(`تعذّرت إزالة ${failCount} عضو`);
    load();
  };

  const handleRemove = async (m: Member) => {
    if (!activeCompany) return;
    if (m.isFounder) { toast.error("لا يمكن إزالة المؤسس"); return; }
    if (!confirm(`إزالة ${m.displayName} من شركة "${activeCompany.nameAr || activeCompany.name}"؟\n(لن يتم حذف حساب المستخدم)`)) return;
    const res = await authedFetch(`/api/companies/${activeCompany.slug}/members/${m.uid}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("تمت إزالة العضو من الشركة");
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "تعذّرت الإزالة");
    }
  };

  if (!activeCompany) {
    return <div className="p-8 md:p-12 text-center text-muted-foreground">اختر شركة أولاً</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold flex items-center gap-2">
            <Users size={20} /> فريقي
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {members.length} عضو في {activeCompany.nameAr || activeCompany.name}
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-1.5 px-[18px] py-2.5 rounded-md bg-primary text-primary-foreground border-none font-bold text-[13px] cursor-pointer max-md:min-h-[44px]"
        >
          <UserPlus size={16} /> دعوة عضو
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="py-2.5 px-4 bg-destructive text-white rounded-md flex flex-wrap justify-between items-center gap-2">
          <span className="font-bold text-[13px]">{selectedIds.size} عضو محدد</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkDeleting}
              className="bg-white/15 text-white border-none rounded-sm px-3.5 py-1.5 cursor-pointer font-bold text-xs disabled:cursor-not-allowed max-md:min-h-[44px]"
            >إلغاء التحديد</button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-white/25 text-white border-none rounded-sm px-3.5 py-1.5 cursor-pointer font-bold text-xs disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px]"
            >{bulkDeleting ? "جارٍ الإزالة…" : "حذف المحدد"}</button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-[14px] border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 md:p-12 text-center text-muted-foreground">جارٍ التحميل…</div>
        ) : members.length === 0 ? (
          <div className="p-8 md:p-12 text-center text-muted-foreground">
            <Users size={36} className="opacity-30 mb-2" />
            <div>لا يوجد أعضاء بعد</div>
          </div>
        ) : (
          <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto garfix-scroll">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="w-10 text-center px-2 py-2.5 text-[11px] text-muted-foreground">
                    <input type="checkbox" checked={selectedIds.size === pageMembers.length && pageMembers.length > 0} onChange={toggleSelectAll} className="cursor-pointer w-4 h-4" aria-label="تحديد الكل" />
                  </th>
                  <th className={thStyle}>الاسم</th>
                  <th className={thStyle}>البريد</th>
                  <th className={thStyle}>الدور</th>
                  <th className={thStyle}>الصلاحيات</th>
                  <th className={thStyle}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {pageMembers.map((m) => {
                  const checked = selectedIds.has(m.uid);
                  return (
                    <tr key={m.uid} className={cn("border-b border-border", checked ? "bg-accent" : "bg-transparent")}>
                      <td className="px-2 py-2.5 text-center">
                        <input type="checkbox" checked={checked} onChange={() => toggleRow(m.uid)} disabled={m.isFounder} className={cn("w-4 h-4", m.isFounder ? "cursor-not-allowed opacity-40" : "cursor-pointer")} aria-label={`تحديد ${m.displayName}`} />
                      </td>
                      <td className={tdStyle}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full text-white flex items-center justify-center font-bold text-[13px] shrink-0"
                            style={{ background: `linear-gradient(135deg, ${roleColor(m.role)}, var(--accent))` }} /* TAILWINDBREAK: dynamic background */
                          >
                            {m.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold">{m.displayName}</span>
                            {m.isFounder && (
                              <span className="text-[10px] text-[#f59e0b] inline-flex items-center gap-0.5">
                                <Crown size={10} /> مؤسس
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={cn(tdStyle, "[direction:ltr] text-end")}>
                        <span className="inline-flex items-center gap-1">
                          <Mail size={12} className="opacity-50" />
                          {m.email}
                        </span>
                      </td>
                      <td className={tdStyle}>
                        <span
                          className="inline-flex items-center gap-1 py-0.5 px-2.5 rounded-full text-[11px] font-bold"
                          style={{ background: `${roleColor(m.role)}22`, color: roleColor(m.role) }} /* TAILWINDBREAK: dynamic color */
                        >
                          {ROLE_LABEL[m.role] || m.role}
                        </span>
                      </td>
                      <td className={tdStyle}>{permSummary(m.permissions, m.role, m.isFounder)}</td>
                      <td className={tdStyle}>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setEditing(m)}
                            title="تعديل"
                            className={iconBtn}
                          ><Edit2 size={14} /></button>
                          <button
                            onClick={() => handleRemove(m)}
                            title="إزالة من الشركة"
                            disabled={m.isFounder}
                            className={cn(iconBtn, "text-destructive disabled:opacity-40 disabled:cursor-not-allowed")}
                          ><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden flex flex-col divide-y divide-border">
            {pageMembers.map((m) => {
              const checked = selectedIds.has(m.uid);
              return (
                <div key={m.uid} className={cn("p-3 flex flex-col gap-3", checked ? "bg-accent" : "bg-transparent")}>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 min-h-[44px]">
                      <input type="checkbox" checked={checked} onChange={() => toggleRow(m.uid)} disabled={m.isFounder} className={cn("w-4 h-4", m.isFounder ? "cursor-not-allowed opacity-40" : "cursor-pointer")} aria-label={`تحديد ${m.displayName}`} />
                      <div
                        className="w-8 h-8 rounded-full text-white flex items-center justify-center font-bold text-[13px] shrink-0"
                        style={{ background: `linear-gradient(135deg, ${roleColor(m.role)}, var(--accent))` }} /* TAILWINDBREAK: dynamic background */
                      >
                        {m.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-[13px]">{m.displayName}</span>
                        {m.isFounder && (
                          <span className="text-[10px] text-[#f59e0b] inline-flex items-center gap-0.5">
                            <Crown size={10} /> مؤسس
                          </span>
                        )}
                      </div>
                    </label>
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(m)} title="تعديل" className="min-w-[44px] min-h-[44px] rounded-sm bg-transparent border border-border text-muted-foreground cursor-pointer flex items-center justify-center"><Edit2 size={14} /></button>
                      <button onClick={() => handleRemove(m)} title="إزالة من الشركة" disabled={m.isFounder} className={cn("min-w-[44px] min-h-[44px] rounded-sm bg-transparent border border-border text-destructive cursor-pointer flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed")}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 text-[13px]">
                    <div className="flex items-center gap-1 [direction:ltr] text-end">
                      <Mail size={12} className="opacity-50" />
                      <span dir="ltr">{m.email}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">الدور:</span>
                      <span
                        className="inline-flex items-center gap-1 py-0.5 px-2.5 rounded-full text-[11px] font-bold"
                        style={{ background: `${roleColor(m.role)}22`, color: roleColor(m.role) }} /* TAILWINDBREAK: dynamic color */
                      >
                        {ROLE_LABEL[m.role] || m.role}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">الصلاحيات:</span>
                      <span className="text-[12px]">{permSummary(m.permissions, m.role, m.isFounder)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap justify-between items-center px-4 py-3 border-t border-border gap-2">
            <span className="text-xs text-muted-foreground">صفحة {safePage} من {totalPages} ({members.length} عضو)</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className={cn("px-3 py-1.5 rounded-sm border border-border font-bold text-xs max-md:min-h-[44px]", safePage === 1 ? "bg-transparent text-muted-foreground cursor-not-allowed opacity-50" : "bg-card text-foreground cursor-pointer")}>السابق</button>
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className={cn("px-3 py-1.5 rounded-sm border border-border font-bold text-xs max-md:min-h-[44px]", safePage === totalPages ? "bg-transparent text-muted-foreground cursor-not-allowed opacity-50" : "bg-card text-foreground cursor-pointer")}>التالي</button>
            </div>
          </div>
          </>
        )}
      </div>

      {showInvite && (
        <InviteDialog
          companySlug={activeCompany.slug}
          onClose={() => setShowInvite(false)}
          onSaved={() => { setShowInvite(false); load(); }}
        />
      )}

      {editing && (
        <EditDialog
          member={editing}
          companySlug={activeCompany.slug}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── Invite Dialog ────────────────────────────────────────────────────────

function InviteDialog({
  companySlug, onClose, onSaved,
}: { companySlug: string; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<string>("employee");
  const [perms, setPerms] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ temporaryPassword?: string | null; created?: boolean; email?: string } | null>(null);

  const togglePerm = (key: string) => {
    setPerms((p) => ({ ...p, [key]: p[key] ? 0 : 1 }));
  };

  const submit = async () => {
    if (!email) { toast.error("البريد الإلكتروني مطلوب"); return; }
    setSaving(true);
    try {
      const res = await authedFetch(`/api/companies/${companySlug}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName: displayName || undefined, role, permissions: perms }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      const data = await res.json();
      if (data.created) {
        toast.success("تم إنشاء الحساب وإضافته للشركة");
      } else {
        toast.success("تمت إضافة العضو للشركة");
      }
      setResult({ temporaryPassword: data.temporaryPassword, created: data.created, email: data.member?.email });
      // Don't close immediately if a temp password was returned — let admin copy it
      if (!data.temporaryPassword) {
        onSaved();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally { setSaving(false); }
  };

  return (
    <DialogShell title="دعوة عضو جديد" icon={<UserPlus size={18} />} onClose={onClose}>
      {result ? (
        <div className="flex flex-col gap-3.5">
          <div className="p-3.5 rounded-md bg-muted border border-border">
            <div className="text-[13px] font-bold mb-1.5">
              {result.created ? "✅ تم إنشاء حساب جديد" : "✅ تمت إضافة العضو"}
            </div>
            {result.temporaryPassword ? (
              <div className="text-xs text-muted-foreground flex flex-col gap-1.5">
                <div>البريد: <span dir="ltr">{result.email}</span></div>
                <div>كلمة المرور المؤقتة:</div>
                <div className="[direction:ltr] text-center p-2.5 rounded-sm bg-background border border-dashed border-border font-mono text-sm font-bold tracking-wider">
                  {result.temporaryPassword}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  شاركها مع المستخدم. يمكنه تغييرها لاحقاً عبر "نسيت كلمة المرور".
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                المستخدم موجود مسبقاً وتم إضافته للشركة بالصلاحيات المحددة.
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button onClick={onSaved} className={primaryBtn}>تم</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelStyle}>البريد الإلكتروني *</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" className={inputStyle} placeholder="user@example.com" />
            </div>
            <div>
              <label className={labelStyle}>الاسم (للمستخدم الجديد)</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputStyle} placeholder="محمد علي" />
            </div>
          </div>

          <div>
            <label className={labelStyle}>الدور</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ROLE_PRESETS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRole(r.value)}
                  className="max-md:min-h-[44px] py-2.5 px-3 rounded-[10px] font-inherit text-xs font-bold cursor-pointer text-right flex flex-col items-start gap-0.5"
                  style={{
                    background: role === r.value ? `${r.color}22` : "var(--background)",
                    border: `1.5px solid ${role === r.value ? r.color : "var(--border)"}`,
                    color: role === r.value ? r.color : "var(--foreground)",
                  }} /* TAILWINDBREAK: dynamic colors */
                >
                  <span>{r.label}</span>
                  <span className="text-[10px] font-normal opacity-80">{r.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {role !== "admin" && (
            <PermEditor perms={perms} onToggle={togglePerm} compact />
          )}

          <div className="flex gap-2.5 justify-end">
            <button onClick={onClose} className={ghostBtn}>إلغاء</button>
            <button onClick={submit} disabled={saving} className={primaryBtn}>
              {saving ? "جارٍ…" : "دعوة"}
            </button>
          </div>
        </div>
      )}
    </DialogShell>
  );
}

// ─── Edit Dialog (permissions editor) ─────────────────────────────────────

function EditDialog({
  member, companySlug, onClose, onSaved,
}: { member: Member; companySlug: string; onClose: () => void; onSaved: () => void }) {
  const [role, setRole] = useState<string>(member.role);
  const [perms, setPerms] = useState<Record<string, number>>({ ...member.permissions });
  const [saving, setSaving] = useState(false);

  const togglePerm = (key: string) => {
    setPerms((p) => ({ ...p, [key]: p[key] ? 0 : 1 }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await authedFetch(`/api/companies/${companySlug}/members/${member.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, permissions: perms }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      toast.success("تم تحديث العضو");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally { setSaving(false); }
  };

  const isFounder = member.isFounder;

  return (
    <DialogShell title={`تعديل: ${member.displayName}`} icon={<Key size={18} />} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <div className="p-2.5 px-3 rounded-md bg-muted border border-border text-xs text-muted-foreground flex items-center gap-2">
          <Mail size={14} />
          <span dir="ltr">{member.email}</span>
        </div>

        <div>
          <label className={labelStyle}>الدور</label>
          {isFounder ? (
            <div className="p-2.5 px-3 rounded-md bg-[#f59e0b22] border border-[#f59e0b] text-[#f59e0b] text-xs font-bold flex items-center gap-1.5">
              <Crown size={14} /> مؤسس — لا يمكن تغيير الدور
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ROLE_PRESETS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRole(r.value)}
                  className="max-md:min-h-[44px] py-2 px-2.5 rounded-lg font-inherit text-[11px] font-bold cursor-pointer text-right"
                  style={{
                    background: role === r.value ? `${r.color}22` : "var(--background)",
                    border: `1.5px solid ${role === r.value ? r.color : "var(--border)"}`,
                    color: role === r.value ? r.color : "var(--foreground)",
                  }} /* TAILWINDBREAK: dynamic colors */
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {!isFounder && role !== "admin" && (
          <PermEditor perms={perms} onToggle={togglePerm} />
        )}

        {(isFounder || role === "admin") && (
          <div className="p-2.5 px-3 rounded-md bg-muted border border-border text-[11px] text-muted-foreground">
            {isFounder
              ? "👑 المؤسس يملك كل الصلاحيات تلقائياً ولا يمكن تقييدها."
              : "👑 المدير يملك كل الصلاحيات تلقائياً ولا يمكن تقييدها."}
          </div>
        )}

        <div className="flex gap-2.5 justify-end">
          <button onClick={onClose} className={ghostBtn}>إلغاء</button>
          <button onClick={save} disabled={saving || isFounder} className={primaryBtn}>
            {saving ? "جارٍ…" : "حفظ"}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

// ─── Permission toggles ───────────────────────────────────────────────────

function PermEditor({
  perms, onToggle, compact = false,
}: { perms: Record<string, number>; onToggle: (key: string) => void; compact?: boolean }) {
  // Group permissions by their `group` field
  const groups = useMemo(() => {
    const m: Record<string, typeof PERMISSION_CATALOG> = {};
    for (const p of PERMISSION_CATALOG) {
      (m[p.group] = m[p.group] || []).push(p);
    }
    return m;
  }, []);

  return (
    <div>
      <label className={labelStyle}>الصلاحيات التفصيلية</label>
      <div className="bg-background border border-border rounded-md p-2.5 flex flex-col gap-2.5">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">{group}</div>
            <div className={cn("grid gap-1.5", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]")}>
              {items.map((p) => {
                const on = !!perms[p.key];
                const locked = LOCKED_PERMS.includes(p.key);
                return (
                  <button
                    key={p.key}
                    onClick={() => onToggle(p.key)}
                    className="max-md:min-h-[44px] flex items-center gap-2 py-2 px-2.5 rounded-lg font-inherit text-xs cursor-pointer text-right text-[var(--foreground)]"
                    style={{
                      background: on ? "var(--primary)15" : "var(--card)",
                      border: `1px solid ${on ? "var(--primary)" : "var(--border)"}`,
                      opacity: locked ? 0.65 : 1,
                    }} /* TAILWINDBREAK: dynamic background, border, opacity */
                    title={locked ? "صلاحية إدارية — تمنح تلقائياً للمدير فقط" : p.label}
                  >
                    <span className="text-sm">{p.icon}</span>
                    <span className="flex-1">{p.label}</span>
                    <span
                      className="w-8 h-[18px] rounded-full relative shrink-0 transition-[background] duration-[150ms]"
                      style={{ background: on ? "var(--primary)" : "var(--muted)" }} /* TAILWINDBREAK: dynamic background */
                    >
                      <span
                        className="absolute top-0.5 w-[14px] h-[14px] rounded-full bg-white transition-[left] duration-[150ms]"
                        style={{ left: on ? 2 : 16 }} /* TAILWINDBREAK: dynamic position */
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1.5">
        🔒 الصلاحيات الإدارية تُمنح تلقائياً للمدير والمؤسس فقط.
      </div>
    </div>
  );
}

// ─── Dialog shell ─────────────────────────────────────────────────────────

function DialogShell({
  title, icon, onClose, children,
}: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/55 backdrop-blur-[4px] z-[1000] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[640px] max-h-[90vh] overflow-y-auto bg-card border border-border rounded-xl p-5 shadow-[0_20px_60px_rgba(0,0,0,0.3)] garfix-scroll"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            {icon} {title}
          </h2>
          <button onClick={onClose} className="bg-transparent border-none text-muted-foreground cursor-pointer p-1 max-md:min-h-[44px] max-md:min-w-[44px] flex items-center justify-center">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default TeamView;
