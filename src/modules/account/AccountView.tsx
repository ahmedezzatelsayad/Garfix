"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth, authedFetch } from "@/context/AuthContext";
import { useBrand } from "@/context/BrandContext";
import { toast } from "sonner";
import { User, Lock, Moon, Sun, Activity, Save, Loader2 } from "lucide-react";

export function AccountView() {
  const { user, refresh } = useAuth();
  const { theme, toggleTheme } = useBrand();
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [activities, setActivities] = useState<Array<Record<string, unknown>>>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);

  // Sync displayName when user changes (render-time adjustment, no cascading render).
  const [prevUser, setPrevUser] = useState(user);
  if (user !== prevUser) {
    setPrevUser(user);
    if (user) setDisplayName(user.displayName);
  }

  const loadActivities = useCallback(async () => {
    try {
      const res = await authedFetch("/api/audit?limit=10");
      if (res.ok) {
        const data = await res.json();
        setActivities(data.logs || []);
      } else {
        // P2 fix (Phase 2 audit): previously silently swallowed non-OK responses,
        // leaving the user staring at "لا توجد نشاطات" even when the request failed.
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "تعذّر تحميل النشاطات");
      }
    } catch {
      toast.error("تعذّر الاتصال بالخادم");
    } finally { setLoadingActivities(false); }
  }, []);
  
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadActivities(); }, [loadActivities]);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await authedFetch(`/api/saas/users/${user?.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      // P2 fix (Phase 2 audit): previously threw a generic "Failed" error which
      // the catch block turned into "فشل الحفظ" — losing the server-side reason
      // (e.g. "يمكنك تعديل اسمك فقط" or "User not found"). Now we surface it.
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      toast.success("تم حفظ البيانات");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    }
    finally { setSavingProfile(false); }
  };

  const changePassword = async () => {
    if (newPassword !== confirmPassword) { toast.error("كلمتا المرور غير متطابقتين"); return; }
    if (newPassword.length < 8) { toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل"); return; }
    setSavingPassword(true);
    try {
      const res = await authedFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("تم تغيير كلمة المرور");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطأ"); }
    finally { setSavingPassword(false); }
  };

  if (!user) return null;

  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 14px", borderRadius: "10px", background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", fontFamily: "inherit", fontSize: "14px", outline: "none" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted-foreground)", marginBottom: "6px" };
  const btnStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", padding: "10px 20px", borderRadius: "10px", background: "var(--primary)", color: "var(--primary-foreground)", border: "none", fontFamily: "inherit", fontSize: "13px", fontWeight: 700, cursor: "pointer" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
        <User size={20} /> حسابي
      </h1>

      {/* Profile */}
      <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "20px" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "14px" }}>البيانات الشخصية</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
          <div style={{ width: "60px", height: "60px", borderRadius: "50%", background: "linear-gradient(135deg, var(--primary), var(--accent))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", fontWeight: 900 }}>
            {user.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700 }}>{user.displayName}</div>
            <div style={{ fontSize: "12px", color: "var(--muted-foreground)", direction: "ltr" }}>{user.email}</div>
            <div style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>الدور: {user.role}{user.isFounder ? " (مؤسس)" : ""}</div>
          </div>
        </div>
        <div style={{ maxWidth: "400px" }}>
          <label style={labelStyle}>الاسم المعروض</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
        </div>
        <button onClick={saveProfile} disabled={savingProfile} style={{ ...btnStyle, marginTop: "12px", opacity: savingProfile ? 0.6 : 1 }}>
          {savingProfile ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} حفظ
        </button>
      </div>

      {/* Password */}
      <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "20px" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
          <Lock size={16} /> تغيير كلمة المرور
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", maxWidth: "600px" }}>
          <div><label style={labelStyle}>كلمة المرور الحالية</label><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} style={inputStyle} dir="ltr" /></div>
          <div><label style={labelStyle}>كلمة المرور الجديدة</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} dir="ltr" /></div>
          <div><label style={labelStyle}>تأكيد كلمة المرور</label><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle} dir="ltr" /></div>
        </div>
        <button onClick={changePassword} disabled={savingPassword || !currentPassword || !newPassword} style={{ ...btnStyle, marginTop: "12px", opacity: savingPassword || !currentPassword || !newPassword ? 0.6 : 1 }}>
          {savingPassword ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} تغيير
        </button>
      </div>

      {/* Preferences */}
      <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "20px" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "14px" }}>التفضيلات</h3>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
          <span style={{ fontSize: "14px" }}>المظهر</span>
          <button onClick={toggleTheme} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)", cursor: "pointer", fontFamily: "inherit", fontSize: "13px" }}>
            {theme === "dark" ? <><Sun size={14} /> فاتح</> : <><Moon size={14} /> داكن</>}
          </button>
        </div>
      </div>

      {/* Activity Log */}
      <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", padding: "20px" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
          <Activity size={16} /> آخر النشاطات
        </h3>
        {loadingActivities ? <div style={{ padding: "20px", textAlign: "center", color: "var(--muted-foreground)" }}>جارٍ التحميل...</div> : activities.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--muted-foreground)" }}>لا توجد نشاطات</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {activities.map((log, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderRadius: "8px", background: "var(--muted)", fontSize: "12px" }}>
                <span><strong>{String(log.action)}</strong> — {String(log.entity)}</span>
                <span style={{ color: "var(--muted-foreground)" }}>{new Date(String(log.createdAt)).toLocaleString("ar-EG")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AccountView;
