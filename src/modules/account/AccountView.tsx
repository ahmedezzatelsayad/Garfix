"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useBrand } from "@/context/BrandContext";
import { toast } from "sonner";
import { useAuditLogLimited, useChangePassword, useUpdateSaasUser } from "@/hooks/queries";
import { User, Lock, Moon, Sun, Activity, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function AccountView() {
  const { user, refresh } = useAuth();
  const { theme, toggleTheme } = useBrand();
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Sync displayName when user changes (render-time adjustment, no cascading render).
  const [prevUser, setPrevUser] = useState(user);
  if (user !== prevUser) {
    setPrevUser(user);
    if (user) setDisplayName(user.displayName);
  }

  const { data: auditData, isLoading: loadingActivities } = useAuditLogLimited(10);
  const activities = auditData?.logs ?? [];

  const updateSaasUser = useUpdateSaasUser();

  const saveProfile = () => {
    if (!user?.uid) return;
    setSavingProfile(true);
    updateSaasUser.mutate(
      { uid: user.uid, displayName },
      {
        onSuccess: async () => {
          toast.success("تم حفظ البيانات");
          await refresh();
          setSavingProfile(false);
        },
        onError: (err) => {
          toast.error(err.message || "فشل الحفظ");
          setSavingProfile(false);
        },
      },
    );
  };

  const changePasswordMutation = useChangePassword();

  const changePassword = () => {
    if (newPassword !== confirmPassword) { toast.error("كلمتا المرور غير متطابقتين"); return; }
    if (newPassword.length < 8) { toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل"); return; }
    setSavingPassword(true);
    changePasswordMutation.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          toast.success("تم تغيير كلمة المرور");
          setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
          setSavingPassword(false);
        },
        onError: (err) => {
          toast.error(err.message || "خطأ");
          setSavingPassword(false);
        },
      },
    );
  };

  if (!user) return null;

  const inputTW = "w-full py-2.5 px-3.5 rounded-[10px] bg-background border border-border text-foreground font-inherit text-sm outline-none"; // TAILWINDBREAK: var(--background)/var(--border)/var(--foreground) CSS variables
  const labelTW = "block text-xs font-semibold text-muted-foreground mb-1.5";
  const btnTW = "inline-flex items-center gap-1.5 py-2.5 px-5 rounded-[10px] bg-primary text-primary-foreground border-none font-inherit text-[13px] font-bold cursor-pointer";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg md:text-2xl font-extrabold flex items-center gap-2">
        <User size={20} /> حسابي
      </h1>

      {/* Profile */}
      <div className="bg-card rounded-[14px] border border-border p-5">
        <h3 className="text-[15px] font-bold mb-3.5">البيانات الشخصية</h3>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-[60px] h-[60px] rounded-full bg-gradient-to-br from-primary to-accent text-white flex items-center justify-center text-2xl font-black">
            {user.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-base font-bold">{user.displayName}</div>
            <div className="text-xs text-muted-foreground" dir="ltr">{user.email}</div>
            <div className="text-[11px] text-muted-foreground">الدور: {user.role}{user.isFounder ? " (مؤسس)" : ""}</div>
          </div>
        </div>
        <div className="max-w-[400px]">
          <label className={labelTW}>الاسم المعروض</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputTW} />
        </div>
        <button onClick={saveProfile} disabled={savingProfile} className={cn(btnTW, "mt-3", savingProfile ? "opacity-60" : "")}>
          {savingProfile ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} حفظ
        </button>
      </div>

      {/* Password */}
      <div className="bg-card rounded-[14px] border border-border p-5">
        <h3 className="text-[15px] font-bold mb-3.5 flex items-center gap-1.5">
          <Lock size={16} /> تغيير كلمة المرور
        </h3>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 max-w-[600px]">
          <div><label className={labelTW}>كلمة المرور الحالية</label><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputTW} dir="ltr" /></div>
          <div><label className={labelTW}>كلمة المرور الجديدة</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputTW} dir="ltr" /></div>
          <div><label className={labelTW}>تأكيد كلمة المرور</label><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputTW} dir="ltr" /></div>
        </div>
        <button onClick={changePassword} disabled={savingPassword || !currentPassword || !newPassword} className={cn(btnTW, "mt-3", savingPassword || !currentPassword || !newPassword ? "opacity-60" : "")}>
          {savingPassword ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} تغيير
        </button>
      </div>

      {/* Preferences */}
      <div className="bg-card rounded-[14px] border border-border p-5">
        <h3 className="text-[15px] font-bold mb-3.5">التفضيلات</h3>
        <div className="flex justify-between items-center py-2.5">
          <span className="text-sm">المظهر</span>
          <button onClick={toggleTheme} className="inline-flex items-center gap-1.5 py-2 px-4 rounded-lg bg-muted border border-border text-foreground cursor-pointer font-inherit text-[13px]">
            {theme === "dark" ? <><Sun size={14} /> فاتح</> : <><Moon size={14} /> داكن</>}
          </button>
        </div>
      </div>

      {/* Activity Log */}
      <div className="bg-card rounded-[14px] border border-border p-5">
        <h3 className="text-[15px] font-bold mb-3.5 flex items-center gap-1.5">
          <Activity size={16} /> آخر النشاطات
        </h3>
        {loadingActivities ? <div className="p-5 text-center text-muted-foreground">جارٍ التحميل...</div> : activities.length === 0 ? (
          <div className="p-5 text-center text-muted-foreground">لا توجد نشاطات</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {activities.map((log, i) => (
              <div key={i} className="flex justify-between py-2 px-3 rounded-lg bg-muted text-xs">
                <span><strong>{String(log.action)}</strong> — {String(log.entity)}</span>
                <span className="text-muted-foreground">{new Date(String(log.createdAt)).toLocaleString("ar-EG")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AccountView;
