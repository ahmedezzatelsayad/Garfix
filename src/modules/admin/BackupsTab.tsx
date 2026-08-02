"use client";

import { useState } from "react";
import { toast } from "sonner";
import { HardDriveDownload, Plus, Loader2 } from "lucide-react";
import { usePlatformBackups, useCreatePlatformBackup } from "@/hooks/queries";

// ─── Item 6: Backups tab (manual backup trigger + list) ──────────────────
// Calls GET /api/backups (list) and POST /api/backups (trigger manual).
// Both endpoints are founder-only — enforced server-side.
interface BackupRow {
  name: string;
  size: number;
  createdAt: string; // ISO
}

export function BackupsTab() {
  const backupsQuery = usePlatformBackups();
  const createMutation = useCreatePlatformBackup();
  const [confirmingTrigger, setConfirmingTrigger] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const backups: BackupRow[] = backupsQuery.data?.backups || [];
  const loading = backupsQuery.isLoading;

  const triggerBackup = async () => {
    setTriggering(true);
    try {
      const data = await createMutation.mutateAsync();
      const name = data?.backupName || data?.name;
      toast.success(name ? `تم إنشاء نسخة احتياطية: ${name}` : "تم إنشاء النسخة الاحتياطية");
      setConfirmingTrigger(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setTriggering(false);
    }
  };

  const fmtSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const fmtDate = (s: string): string => {
    if (!s) return "—";
    try {
      const d = new Date(s);
      if (isNaN(d.getTime())) return s;
      return d.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
    } catch { return s; }
  };

  const backupThClass = "text-right px-3 py-2.5 text-[11px] font-semibold text-[var(--muted-foreground)] border-b border-b-[var(--border)] bg-[var(--muted)]";
  const backupTdClass = "px-3 py-2.5 text-[13px] border-b border-b-[var(--border)] align-middle";

  return (
    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden hover-lift">
      <div className="px-5 py-4 border-b border-b-[var(--border)] flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h3 className="text-[15px] font-bold flex items-center gap-2">
            <HardDriveDownload size={16} className="text-primary" /> النسخ الاحتياطي اليدوي
          </h3>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            إنشاء نسخة SQLite مشفّرة (AES-256-GCM) من قاعدة البيانات الحالية. يتطلب صلاحيات المؤسس.
          </p>
        </div>
        <button
          onClick={() => setConfirmingTrigger(true)}
          disabled={triggering}
          className="inline-flex items-center gap-2 px-4.5 py-2.5 rounded-[10px] bg-[var(--primary)] text-[var(--primary-foreground)] border-none font-inherit text-[13px] font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 active-press"
        >
          {triggering ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {triggering ? "جارٍ الإنشاء…" : "نسخة احتياطية جديدة"}
        </button>
      </div>

      {loading ? (
        <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)] flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" /> جارٍ التحميل…
        </div>
      ) : backups.length === 0 ? (
        <div className="p-6 md:p-12 text-center text-[var(--muted-foreground)]">
          <HardDriveDownload size={36} className="opacity-30 mb-2" />
          <div>لا توجد نسخ احتياطية بعد.</div>
        </div>
      ) : (
        <div className="garfix-scroll overflow-x-auto">
          <table className="w-full [border-collapse:collapse] table-enterprise">
            <thead>
              <tr>
                <th scope="col" className={backupThClass}>اسم الملف</th>
                <th scope="col" className={backupThClass}>الحجم</th>
                <th scope="col" className={backupThClass}>تاريخ الإنشاء</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b, i) => (
                <tr key={b.name || i}>
                  <td className="px-3 py-2.5 text-[12px] border-b border-b-[var(--border)] align-middle font-mono" dir="ltr">{b.name}</td>
                  <td className={backupTdClass}>{fmtSize(b.size)}</td>
                  <td className={backupTdClass}>{fmtDate(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmingTrigger && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          onClick={() => !triggering && setConfirmingTrigger(false)}
        >
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl w-full p-5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] max-w-[440px]"
 onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-3.5">
              <div className="w-10 h-10 rounded-full bg-emerald-600/15 text-[var(--primary)] flex items-center justify-center shrink-0">
                <HardDriveDownload size={18} />
              </div>
              <div>
                <h4 className="text-[15px] font-bold mb-1">تأكيد النسخ الاحتياطي</h4>
                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                  سيتم إنشاء نسخة احتياطية مشفّرة من قاعدة البيانات الحالية. قد يستغرق ذلك عدة ثوانٍ.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmingTrigger(false)}
                disabled={triggering}
                className="px-4 py-2 rounded-lg border border-[var(--border)] bg-transparent text-[var(--foreground)] font-inherit text-[13px] font-semibold cursor-pointer disabled:cursor-not-allowed active-press"
              >
                إلغاء
              </button>
              <button
                onClick={triggerBackup}
                disabled={triggering}
                className="px-4 py-2 rounded-lg border-none bg-[var(--primary)] text-[var(--primary-foreground)] font-inherit text-[13px] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 active-press"
              >
                {triggering ? <Loader2 size={14} className="animate-spin" /> : <HardDriveDownload size={14} />}
                {triggering ? "جارٍ…" : "تأكيد الإنشاء"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
