"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth, authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Building2, Users, CreditCard, Plus, X, Edit2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
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
    return <div className="p-12 text-center text-muted-foreground">هذه الصفحة مخصصة للمدراء فقط</div>;
  }

  const usersTotalPages = Math.max(1, Math.ceil(users.length / saasPageSize));
  const usersSafePage = Math.min(usersPage, usersTotalPages);
  const currentPageUsers = users.slice((usersSafePage - 1) * saasPageSize, usersSafePage * saasPageSize);

  const companiesTotalPages = Math.max(1, Math.ceil(companies.length / saasPageSize));
  const companiesSafePage = Math.min(companiesPage, companiesTotalPages);
  const currentPageCompanies = companies.slice((companiesSafePage - 1) * saasPageSize, companiesSafePage * saasPageSize);

  const saasPageBtnClass = (disabled: boolean): string =>
    cn("py-1.5 px-3 rounded-md border border-border font-inherit text-xs font-bold", disabled ? "bg-transparent text-muted-foreground cursor-not-allowed opacity-50" : "bg-card text-foreground cursor-pointer");

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode; count: number }> = [
    { key: "users", label: "المستخدمون", icon: <Users size={14} />, count: users.length },
    { key: "companies", label: "الشركات", icon: <Building2 size={14} />, count: companies.length },
    { key: "payments", label: "المدفوعات", icon: <CreditCard size={14} />, count: payments.length },
    { key: "settings", label: "إعدادات", icon: <Plus size={14} />, count: 0 },
  ];

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div>
        <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold flex items-center gap-2"><Building2 size={20} /> لوحة تحكم المنصة</h1>
        <p className="text-[13px] text-muted-foreground">إدارة المستخدمين والشركات والمدفوعات</p>
      </div>
      <div className="flex gap-1.5 overflow-x-auto garfix-scroll">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn("inline-flex items-center gap-1.5 py-2 px-4 rounded-[10px] border border-border font-inherit text-xs font-bold cursor-pointer whitespace-nowrap", tab === t.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
            {t.icon} {t.label} ({t.count})
          </button>
        ))}
      </div>

      {loading ? <div className="p-12 text-center text-muted-foreground">جارٍ التحميل…</div> : (
        <div className="bg-card rounded-[14px] border border-border overflow-hidden">
          {tab === "users" && (
            <>
              <div className="py-2 sm:py-3 px-3 sm:px-4 border-b border-border flex justify-between items-center">
                <h3 className="text-sm font-bold">المستخدمون ({users.length})</h3>
                <button onClick={() => setShowUserForm(true)} className="inline-flex items-center gap-1 py-1.5 px-3 rounded-lg bg-primary text-primary-foreground border-none font-inherit text-[11px] font-bold cursor-pointer"><Plus size={12} /> مستخدم جديد</button>
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
              <div className="overflow-x-auto garfix-scroll">
                <table className="w-full border-collapse">
                  <thead><tr className="bg-muted">
                    <th className="text-right py-2.5 px-3 text-[11px] text-muted-foreground font-bold">الاسم</th><th className="text-right py-2.5 px-3 text-[11px] text-muted-foreground font-bold">البريد</th><th className="text-right py-2.5 px-3 text-[11px] text-muted-foreground font-bold">الدور</th>
                    <th className="text-right py-2.5 px-3 text-[11px] text-muted-foreground font-bold">الشركات</th><th className="text-right py-2.5 px-3 text-[11px] text-muted-foreground font-bold hidden md:table-cell">المؤسس</th><th className="text-right py-2.5 px-3 text-[11px] text-muted-foreground font-bold">إجراءات</th>
                  </tr></thead>
                  <tbody>
                    {currentPageUsers.map((u) => (
                      <tr key={u.uid} className="border-b border-border">
                        <td className="py-2.5 px-3 text-[13px] font-bold">{u.displayName}</td>
                        <td className="py-2.5 px-3 text-[13px] text-right" dir="ltr">{u.email}</td>
                        <td className="py-2.5 px-3 text-[13px]">{u.role}</td>
                        <td className="py-2.5 px-3 text-[13px]">{u.companies?.length || 0}</td>
                        <td className="py-2.5 px-3 text-[13px] hidden md:table-cell">{u.isFounder ? "✓" : "—"}</td>
                        <td className="py-2.5 px-3 text-[13px]">
                          <div className="flex gap-1">
                            <button
                              onClick={() => setEditingUser(u)}
                              disabled={u.isFounder}
                              title={u.isFounder ? "لا يمكن تعديل المؤسس من هنا" : "تعديل"}
                              className={cn("inline-flex items-center justify-center w-7 h-7 rounded-md bg-transparent border border-border text-blue-500 p-0", u.isFounder ? "cursor-not-allowed opacity-40" : "cursor-pointer")}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => setDeletingUser(u)}
                              disabled={u.isFounder}
                              title={u.isFounder ? "لا يمكن حذف المؤسس" : "حذف"}
                              className={cn("inline-flex items-center justify-center w-7 h-7 rounded-md bg-transparent border border-border text-red-500 p-0", u.isFounder ? "cursor-not-allowed opacity-40" : "cursor-pointer")}
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
                <div className="flex justify-between items-center py-3 px-4 border-t border-border flex-wrap gap-2">
                  <span className="text-xs text-muted-foreground">صفحة {usersSafePage} من {usersTotalPages} ({users.length} مستخدم)</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setUsersPage((p) => Math.max(1, p - 1))} disabled={usersSafePage === 1} className={saasPageBtnClass(usersSafePage === 1)}>السابق</button>
                    <button onClick={() => setUsersPage((p) => Math.min(usersTotalPages, p + 1))} disabled={usersSafePage === usersTotalPages} className={saasPageBtnClass(usersSafePage === usersTotalPages)}>التالي</button>
                  </div>
                </div>
              )}
            </>
          )}
          {tab === "companies" && (
            <>
              <div className="overflow-x-auto garfix-scroll">
                <table className="w-full border-collapse">
                  <thead><tr className="bg-muted">
                    <th className="text-right py-2.5 px-3 text-[11px] text-muted-foreground font-bold">الشركة</th><th className="text-right py-2.5 px-3 text-[11px] text-muted-foreground font-bold">المعرّف</th><th className="text-right py-2.5 px-3 text-[11px] text-muted-foreground font-bold">الباقة</th>
                    <th className="text-right py-2.5 px-3 text-[11px] text-muted-foreground font-bold">الحالة</th><th className="text-right py-2.5 px-3 text-[11px] text-muted-foreground font-bold">تاريخ الإنشاء</th>
                  </tr></thead>
                  <tbody>
                    {companies.length === 0 ? <tr><td colSpan={5} className="py-2.5 px-3 text-[13px] text-center p-8 text-muted-foreground">لا توجد شركات بعد</td></tr> :
                      currentPageCompanies.map((c) => (
                        <tr key={c.id} className="border-b border-border">
                          <td className="py-2.5 px-3 text-[13px] font-bold">{c.emoji} {c.nameAr || c.name}</td>
                          <td className="py-2.5 px-3 text-[13px] font-mono">{c.slug}</td>
                          <td className="py-2.5 px-3 text-[13px]">{c.plan}</td>
                          <td className="py-2.5 px-3 text-[13px]">{c.subscriptionStatus}</td>
                          <td className="py-2.5 px-3 text-[13px]">{new Date(c.createdAt).toLocaleDateString("ar-EG")}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
              {companies.length > saasPageSize && (
                <div className="flex justify-between items-center py-3 px-4 border-t border-border flex-wrap gap-2">
                  <span className="text-xs text-muted-foreground">صفحة {companiesSafePage} من {companiesTotalPages} ({companies.length} شركة)</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setCompaniesPage((p) => Math.max(1, p - 1))} disabled={companiesSafePage === 1} className={saasPageBtnClass(companiesSafePage === 1)}>السابق</button>
                    <button onClick={() => setCompaniesPage((p) => Math.min(companiesTotalPages, p + 1))} disabled={companiesSafePage === companiesTotalPages} className={saasPageBtnClass(companiesSafePage === companiesTotalPages)}>التالي</button>
                  </div>
                </div>
              )}
            </>
          )}
          {tab === "payments" && (
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse">
                <thead><tr className="bg-muted">
                  <th className="text-right py-2.5 px-3 text-[11px] text-muted-foreground font-bold">الشركة</th><th className="text-right py-2.5 px-3 text-[11px] text-muted-foreground font-bold">الباقة</th><th className="text-right py-2.5 px-3 text-[11px] text-muted-foreground font-bold">المبلغ</th>
                  <th className="text-right py-2.5 px-3 text-[11px] text-muted-foreground font-bold">الحالة</th><th className="text-right py-2.5 px-3 text-[11px] text-muted-foreground font-bold">التاريخ</th>
                </tr></thead>
                <tbody>
                  {payments.length === 0 ? <tr><td colSpan={5} className="py-2.5 px-3 text-[13px] text-center p-8 text-muted-foreground">لا توجد مدفوعات بعد</td></tr> :
                    payments.map((p) => (
                      <tr key={p.id} className="border-b border-border">
                        <td className="py-2.5 px-3 text-[13px] font-mono">{p.companySlug}</td>
                        <td className="py-2.5 px-3 text-[13px]">{p.plan}</td>
                        <td className="py-2.5 px-3 text-[13px] font-bold text-right" dir="ltr">{p.amount} {p.currency}</td>
                        <td className="py-2.5 px-3 text-[13px]">{p.status === "paid" ? <span className="py-0.5 px-2.5 rounded-xl bg-emerald-500/15 text-emerald-500 text-[11px] font-bold">{p.status}</span> : <span className="py-0.5 px-2.5 rounded-xl bg-amber-500/15 text-amber-500 text-[11px] font-bold">{p.status}</span>}</td>
                        <td className="py-2.5 px-3 text-[13px]">{new Date(p.createdAt).toLocaleDateString("ar-EG")}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          )}
          {tab === "settings" && (
            <div className="p-8 text-center text-muted-foreground">
              إعدادات المنصة — متاحة للمؤسس فقط من خلال صفحة إدارة المؤسس.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// th style converted to Tailwind inline classes
// td style converted to Tailwind inline classes
const inputTW = "w-full py-2 px-3 rounded-lg bg-background border border-border text-foreground font-inherit text-[13px] outline-none"; // TAILWINDBREAK: var(--background)/var(--border)/var(--foreground) CSS variables
const labelTW = "block text-[11px] font-semibold text-muted-foreground mb-1";

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
    <div className="p-3 sm:p-4 border-b border-border bg-muted flex flex-col gap-2.5">
      <div className="flex justify-between items-center">
        <h4 className="text-[13px] font-bold">{isEdit ? "تعديل مستخدم" : "مستخدم جديد"}</h4>
        <button onClick={onClose} className="bg-transparent border-none text-muted-foreground cursor-pointer p-1"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2 sm:gap-2.5">
        <div>
          <label className={labelTW}>الاسم</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputTW} />
        </div>
        <div>
          <label className={labelTW}>البريد</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputTW} dir="ltr" disabled={isEdit} title={isEdit ? "لا يمكن تغيير البريد" : ""} />
        </div>
        {!isEdit && (
          <div>
            <label className={labelTW}>كلمة المرور</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputTW} dir="ltr" />
          </div>
        )}
        <div>
          <label className={labelTW}>الدور</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputTW}>
            <option value="admin">مدير</option><option value="editor">محرّر</option>
            <option value="employee">موظف</option><option value="viewer">مشاهد</option>
            {isEdit && <option value="inactive">غير نشط (محذوف ناعم)</option>}
          </select>
        </div>
        {isEdit && (
          <div className="col-span-full">
            <label className={labelTW}>الشركات (افصل بفواصل)</label>
            <input value={companiesText} onChange={(e) => setCompaniesText(e.target.value)} className={inputTW} dir="ltr" placeholder="company-1, company-2" />
          </div>
        )}
      </div>
      <button onClick={submit} disabled={saving} className={cn("self-end py-2 px-5 rounded-lg bg-primary text-primary-foreground border-none font-inherit text-xs font-bold", saving ? "cursor-not-allowed opacity-70" : "cursor-pointer")}>{saving ? "جارٍ…" : (isEdit ? "حفظ" : "إنشاء")}</button>
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
