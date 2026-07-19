"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth, authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Building2, Users, CreditCard, Plus, X, Edit2, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface User {
  uid: string; email: string; displayName: string; role: string;
  companies: string[]; isFounder?: boolean; createdAt: string;
}
interface Company {
  id: number; name: string; slug: string; nameAr?: string; emoji?: string;
  plan: string; subscriptionStatus: string; createdAt: string;
}
interface Payment {
  id: number; companySlug: string; plan: string; method: string;
  amount: number; currency: string; status: string; createdAt: string;
}

type Tab = "users" | "companies" | "payments" | "settings";

export function SaaSControlPanel() {
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const [companiesPage, setCompaniesPage] = useState(1);
  const saasPageSize = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, c, p] = await Promise.all([
        authedFetch("/api/saas/users"),
        authedFetch("/api/companies"),
        authedFetch("/api/saas/payments"),
      ]);
      const [uD, cD, pD] = await Promise.all([u.json(), c.json(), p.json()]);
      if (u.ok) setUsers(uD.users || []);
      if (c.ok) setCompanies(cD.companies || []);
      if (p.ok) setPayments(pD.payments || []);
    } finally { setLoading(false); }
  }, []);

  // setState runs inside async .then() callback in load (after await authedFetch) — not synchronous in effect body; no cascading render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (!currentUser || (currentUser.role !== "admin" && !currentUser.isFounder)) {
    return <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>هذه الصفحة مخصصة للمدراء فقط</div>;
  }

  const usersTotalPages = Math.max(1, Math.ceil(users.length / saasPageSize));
  const usersSafePage = Math.min(usersPage, usersTotalPages);
  const currentPageUsers = users.slice((usersSafePage - 1) * saasPageSize, usersSafePage * saasPageSize);

  const companiesTotalPages = Math.max(1, Math.ceil(companies.length / saasPageSize));
  const companiesSafePage = Math.min(companiesPage, companiesTotalPages);
  const currentPageCompanies = companies.slice((companiesSafePage - 1) * saasPageSize, companiesSafePage * saasPageSize);

  const saasPageBtnStyle = (disabled: boolean): React.CSSProperties => ({
    padding: "6px 12px", borderRadius: "6px",
    background: disabled ? "transparent" : "var(--card)",
    color: disabled ? "var(--muted-foreground)" : "var(--foreground)",
    border: "1px solid var(--border)", fontFamily: "inherit", fontSize: "12px", fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
  });

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode; count: number }> = [
    { key: "users", label: "المستخدمون", icon: <Users size={14} />, count: users.length },
    { key: "companies", label: "الشركات", icon: <Building2 size={14} />, count: companies.length },
    { key: "payments", label: "المدفوعات", icon: <CreditCard size={14} />, count: payments.length },
    { key: "settings", label: "إعدادات", icon: <Plus size={14} />, count: 0 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <h1 style={{ fontSize: "24px", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}><Building2 size={20} /> لوحة تحكم المنصة</h1>
        <p style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>إدارة المستخدمين والشركات والمدفوعات</p>
      </div>
      <div style={{ display: "flex", gap: "6px", overflowX: "auto" }} className="garfix-scroll">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "10px", background: tab === t.key ? "var(--primary)" : "var(--card)", color: tab === t.key ? "var(--primary-foreground)" : "var(--muted-foreground)", border: "1px solid var(--border)", fontFamily: "inherit", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            {t.icon} {t.label} ({t.count})
          </button>
        ))}
      </div>

      {loading ? <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>جارٍ التحميل…</div> : (
        <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
          {tab === "users" && (
            <>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 700 }}>المستخدمون ({users.length})</h3>
                <button onClick={() => setShowUserForm(true)} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "6px 12px", borderRadius: "8px", background: "var(--primary)", color: "var(--primary-foreground)", border: "none", fontFamily: "inherit", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}><Plus size={12} /> مستخدم جديد</button>
              </div>
              {showUserForm && <UserForm onClose={() => setShowUserForm(false)} onSaved={() => { setShowUserForm(false); load(); }} />}
              {editingUser && (
                <UserForm
                  editTarget={editingUser}
                  onClose={() => setEditingUser(null)}
                  onSaved={() => { setEditingUser(null); load(); }}
                />
              )}
              {deletingUser && (
                <DeleteUserConfirm
                  user={deletingUser}
                  onClose={() => setDeletingUser(null)}
                  onDeleted={() => { setDeletingUser(null); load(); }}
                />
              )}
              <div style={{ overflowX: "auto" }} className="garfix-scroll">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: "var(--muted)" }}>
                    <th style={th}>الاسم</th><th style={th}>البريد</th><th style={th}>الدور</th>
                    <th style={th}>الشركات</th><th style={th}>المؤسس</th><th style={th}>إجراءات</th>
                  </tr></thead>
                  <tbody>
                    {currentPageUsers.map((u) => (
                      <tr key={u.uid} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ ...td, fontWeight: 700 }}>{u.displayName}</td>
                        <td style={{ ...td, direction: "ltr", textAlign: "right" }}>{u.email}</td>
                        <td style={td}>{u.role}</td>
                        <td style={td}>{u.companies?.length || 0}</td>
                        <td style={td}>{u.isFounder ? "✓" : "—"}</td>
                        <td style={td}>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button
                              onClick={() => setEditingUser(u)}
                              disabled={u.isFounder}
                              title={u.isFounder ? "لا يمكن تعديل المؤسس من هنا" : "تعديل"}
                              style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                width: "28px", height: "28px", borderRadius: "6px",
                                background: "transparent", border: "1px solid var(--border)",
                                color: "#3b82f6", cursor: u.isFounder ? "not-allowed" : "pointer",
                                opacity: u.isFounder ? 0.4 : 1, padding: 0,
                              }}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => setDeletingUser(u)}
                              disabled={u.isFounder}
                              title={u.isFounder ? "لا يمكن حذف المؤسس" : "حذف"}
                              style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                width: "28px", height: "28px", borderRadius: "6px",
                                background: "transparent", border: "1px solid var(--border)",
                                color: "#ef4444", cursor: u.isFounder ? "not-allowed" : "pointer",
                                opacity: u.isFounder ? 0.4 : 1, padding: 0,
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {users.length > saasPageSize && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>صفحة {usersSafePage} من {usersTotalPages} ({users.length} مستخدم)</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button onClick={() => setUsersPage((p) => Math.max(1, p - 1))} disabled={usersSafePage === 1} style={saasPageBtnStyle(usersSafePage === 1)}>السابق</button>
                    <button onClick={() => setUsersPage((p) => Math.min(usersTotalPages, p + 1))} disabled={usersSafePage === usersTotalPages} style={saasPageBtnStyle(usersSafePage === usersTotalPages)}>التالي</button>
                  </div>
                </div>
              )}
            </>
          )}
          {tab === "companies" && (
            <>
              <div style={{ overflowX: "auto" }} className="garfix-scroll">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: "var(--muted)" }}>
                    <th style={th}>الشركة</th><th style={th}>المعرّف</th><th style={th}>الباقة</th>
                    <th style={th}>الحالة</th><th style={th}>تاريخ الإنشاء</th>
                  </tr></thead>
                  <tbody>
                    {companies.length === 0 ? <tr><td colSpan={5} style={{ ...td, textAlign: "center", padding: "32px", color: "var(--muted-foreground)" }}>لا توجد شركات بعد</td></tr> :
                      currentPageCompanies.map((c) => (
                        <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ ...td, fontWeight: 700 }}>{c.emoji} {c.nameAr || c.name}</td>
                          <td style={{ ...td, fontFamily: "monospace" }}>{c.slug}</td>
                          <td style={td}>{c.plan}</td>
                          <td style={td}>{c.subscriptionStatus}</td>
                          <td style={td}>{new Date(c.createdAt).toLocaleDateString("ar-EG")}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
              {companies.length > saasPageSize && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>صفحة {companiesSafePage} من {companiesTotalPages} ({companies.length} شركة)</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button onClick={() => setCompaniesPage((p) => Math.max(1, p - 1))} disabled={companiesSafePage === 1} style={saasPageBtnStyle(companiesSafePage === 1)}>السابق</button>
                    <button onClick={() => setCompaniesPage((p) => Math.min(companiesTotalPages, p + 1))} disabled={companiesSafePage === companiesTotalPages} style={saasPageBtnStyle(companiesSafePage === companiesTotalPages)}>التالي</button>
                  </div>
                </div>
              )}
            </>
          )}
          {tab === "payments" && (
            <div style={{ overflowX: "auto" }} className="garfix-scroll">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "var(--muted)" }}>
                  <th style={th}>الشركة</th><th style={th}>الباقة</th><th style={th}>المبلغ</th>
                  <th style={th}>الحالة</th><th style={th}>التاريخ</th>
                </tr></thead>
                <tbody>
                  {payments.length === 0 ? <tr><td colSpan={5} style={{ ...td, textAlign: "center", padding: "32px", color: "var(--muted-foreground)" }}>لا توجد مدفوعات بعد</td></tr> :
                    payments.map((p) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ ...td, fontFamily: "monospace" }}>{p.companySlug}</td>
                        <td style={td}>{p.plan}</td>
                        <td style={{ ...td, direction: "ltr", textAlign: "right", fontWeight: 700 }}>{p.amount} {p.currency}</td>
                        <td style={td}><span style={{ padding: "2px 10px", borderRadius: "12px", background: p.status === "paid" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)", color: p.status === "paid" ? "#10b981" : "#f59e0b", fontSize: "11px", fontWeight: 700 }}>{p.status}</span></td>
                        <td style={td}>{new Date(p.createdAt).toLocaleDateString("ar-EG")}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          )}
          {tab === "settings" && (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--muted-foreground)" }}>
              إعدادات المنصة — متاحة للمؤسس فقط من خلال صفحة إدارة المؤسس.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "right", padding: "10px 12px", fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 700 };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: "13px" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: "8px", background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "inherit", fontSize: "13px", outline: "none" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 600, color: "var(--muted-foreground)", marginBottom: "4px" };

function UserForm({ onClose, onSaved, editTarget }: { onClose: () => void; onSaved: () => void; editTarget?: User }) {
  const isEdit = !!editTarget;
  const [email, setEmail] = useState(editTarget?.email || "");
  const [displayName, setDisplayName] = useState(editTarget?.displayName || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(editTarget?.role || "employee");
  const [companiesText, setCompaniesText] = useState((editTarget?.companies || []).join(", "));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!email || !displayName) { toast.error("الاسم والبريد مطلوبان"); return; }
    if (!isEdit && !password) { toast.error("كلمة المرور مطلوبة لإنشاء مستخدم جديد"); return; }
    setSaving(true);
    try {
      if (isEdit && editTarget) {
        // PATCH /api/saas/users/[uid] — only sends changed fields
        const body: Record<string, unknown> = { displayName, role };
        const slugs = companiesText.split(",").map((s) => s.trim()).filter(Boolean);
        body.companies = slugs;
        const res = await authedFetch(`/api/saas/users/${encodeURIComponent(editTarget.uid)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
        toast.success("تم تحديث المستخدم");
      } else {
        const res = await authedFetch("/api/saas/users", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, displayName, password, role, companies: [] }),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
        toast.success("تم إنشاء المستخدم");
      }
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", background: "var(--muted)", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ fontSize: "13px", fontWeight: 700 }}>{isEdit ? "تعديل مستخدم" : "مستخدم جديد"}</h4>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--muted-foreground)", cursor: "pointer", padding: "4px" }}><X size={14} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
        <div>
          <label style={labelStyle}>الاسم</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>البريد</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} dir="ltr" disabled={isEdit} title={isEdit ? "لا يمكن تغيير البريد" : ""} />
        </div>
        {!isEdit && (
          <div>
            <label style={labelStyle}>كلمة المرور</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} dir="ltr" />
          </div>
        )}
        <div>
          <label style={labelStyle}>الدور</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
            <option value="admin">مدير</option><option value="editor">محرّر</option>
            <option value="employee">موظف</option><option value="viewer">مشاهد</option>
            {isEdit && <option value="inactive">غير نشط (محذوف ناعم)</option>}
          </select>
        </div>
        {isEdit && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>الشركات (افصل بفواصل)</label>
            <input value={companiesText} onChange={(e) => setCompaniesText(e.target.value)} style={inputStyle} dir="ltr" placeholder="company-1, company-2" />
          </div>
        )}
      </div>
      <button onClick={submit} disabled={saving} style={{ alignSelf: "flex-end", padding: "8px 20px", borderRadius: "8px", background: "var(--primary)", color: "var(--primary-foreground)", border: "none", fontFamily: "inherit", fontSize: "12px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "جارٍ…" : (isEdit ? "حفظ" : "إنشاء")}</button>
    </div>
  );
}

/**
 * Admin P1.2 — Delete user confirmation dialog.
 * Calls DELETE /api/saas/users/[uid] (founder-only soft-delete).
 *
 * P1-UI-Agent refactor: switched from inline panel to shadcn AlertDialog
 * (radix-ui alert-dialog primitive) for proper focus-trap, ESC handling,
 * scroll lock, and a proper modal confirmation pattern. The action button
 * uses event.preventDefault() to keep the dialog open while the DELETE
 * request is in flight, then closes via onDeleted() on success.
 */
function DeleteUserConfirm({ user, onClose, onDeleted }: { user: User; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const doDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    // Prevent radix AlertDialog from auto-closing before the request settles.
    e.preventDefault();
    setDeleting(true);
    try {
      const res = await authedFetch(`/api/saas/users/${encodeURIComponent(user.uid)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`تم حذف المستخدم "${user.displayName}" ناعماً (دوره أصبح inactive)`);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setDeleting(false);
    }
  };
  return (
    <AlertDialog open={true} onOpenChange={(open) => { if (!open && !deleting) onClose(); }}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-right flex items-center gap-2 text-destructive">
            <Trash2 size={16} /> تأكيد حذف المستخدم
          </AlertDialogTitle>
          <AlertDialogDescription className="text-right">
            سيتم حذف المستخدم <strong>{user.displayName}</strong> ({user.email}) ناعماً — سيبقى سجله في قاعدة البيانات للامتثال الضريبي،
            لكنه لن يستطيع تسجيل الدخول وستُلغى جميع جلساته الحالية.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting} onClick={onClose}>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={doDelete}
            disabled={deleting}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {deleting ? "جارٍ…" : "حذف نهائي"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default SaaSControlPanel;
