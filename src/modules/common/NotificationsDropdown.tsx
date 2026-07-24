// Responsive: sm/md/lg breakpoints added
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useNotifications, useMarkAllNotificationsRead } from "@/hooks/queries/dashboard";
import { toast } from "sonner";
import { Bell, X, CheckCheck, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notification {
  id: number;
  userUid: string;
  companySlug?: string | null;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
  readAt?: string | null;
}

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  overdue_invoice: { label: "فاتورة متأخرة", color: "#ef4444" },
  subscription_expiring: { label: "اشتراك ينتهي", color: "#f59e0b" },
  residence_expiring: { label: "إقامة تنتهي", color: "#f59e0b" },
  low_stock: { label: "نقص مخزون", color: "#3b82f6" },
  payment_received: { label: "دفعة مستلمة", color: "#10b981" },
  general: { label: "عام", color: "#7c3aed" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "الآن";
  const min = Math.floor(sec / 60);
  if (min < 60) return `قبل ${min} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `قبل ${hr} ساعة`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `قبل ${day} يوم`;
  const month = Math.floor(day / 30);
  if (month < 12) return `قبل ${month} شهر`;
  return `قبل ${Math.floor(month / 12)} سنة`;
}

export function NotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // TanStack Query hook replaces raw authedFetch polling
  const { data: notificationsData, isLoading: loading } = useNotifications("");
  const markAllReadMutation = useMarkAllNotificationsRead();

  const notifications = notificationsData?.notifications || [];
  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await markAllReadMutation.mutateAsync();
      toast.success("تم تعليم جميع الإشعارات كمقروءة");
    } catch {
      toast.error("تعذّر تحديث الإشعارات");
    } finally {
      setMarkingAll(false);
    }
  }, [markAllReadMutation]);

  // Close on outside click + ESC
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="الإشعارات"
        title="الإشعارات"
        className="bg-muted border border-border w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground cursor-pointer relative transition-colors duration-150"
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "var(--muted)"; }}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            className="absolute top-[3px] right-[3px] min-w-[16px] h-4 px-1 rounded-lg bg-red-500 text-white text-[9px] font-extrabold flex items-center justify-center border-2 border-background"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-[calc(100%+8px)] left-0 w-[calc(100vw-32px)] sm:w-[350px] max-h-[440px] bg-popover border border-border rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.18)] z-[200] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div
            className="py-3 px-3.5 border-b border-border flex items-center justify-between bg-card"
          >
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-primary" />
              <span className="text-[13px] font-extrabold">الإشعارات</span>
              {unreadCount > 0 && (
                <span
                  className="bg-red-500 text-white text-[10px] font-bold py-0.5 px-[7px] rounded-[10px]"
                >
                  {unreadCount} غير مقروء
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="إغلاق"
              className="bg-transparent border-none text-muted-foreground cursor-pointer p-0.5 rounded flex items-center"
            >
              <X size={14} />
            </button>
          </div>

          {/* List */}
          <div
            className="flex-1 overflow-y-auto p-1 garfix-scroll"
          >
            {loading ? (
              <div className="p-8 text-center text-muted-foreground text-xs">
                جارٍ التحميل…
              </div>
            ) : notifications.length === 0 ? (
              <div
                className="py-10 px-4 text-center text-muted-foreground flex flex-col items-center gap-2"
              >
                <BellOff size={28} className="opacity-40" />
                <div className="text-xs">لا توجد إشعارات</div>
              </div>
            ) : (
              notifications.map((n) => {
                const meta = TYPE_LABELS[n.type] || { label: n.type, color: "#7c3aed" };
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleClickNotification(n)}
                    className={cn("w-full flex gap-2.5 py-2.5 px-3 mb-0.5 rounded-lg border-none cursor-pointer font-inherit text-right transition-colors duration-100 text-popover-foreground", n.isRead ? "bg-transparent" : "bg-accent")}
                    onMouseEnter={(e) => { if (n.isRead) e.currentTarget.classList.add("bg-muted"); }}
                    onMouseLeave={(e) => { if (n.isRead) e.currentTarget.classList.remove("bg-muted"); }}
                  >
                    {/* Unread dot */}
                    <div className="shrink-0 pt-1">
                      <span
                        className="block w-2 h-2 rounded-full"
                        style={{ background: n.isRead ? "transparent" : meta.color, border: n.isRead ? `1px solid ${meta.color}80` : "none" }} // TAILWINDBREAK: dynamic notification type color
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-[3px] flex-wrap">
                        <span className="text-xs font-extrabold overflow-hidden text-ellipsis">
                          {n.title}
                        </span>
                        <span
                          className="text-[9px] font-bold py-0.5 px-1.5 rounded-lg whitespace-nowrap"
                          style={{ background: `${meta.color}20`, color: meta.color }} // TAILWINDBREAK: dynamic notification type color
                        >
                          {meta.label}
                        </span>
                      </div>
                      <div
                        className="text-[11px] text-muted-foreground leading-relaxed mb-1 overflow-hidden text-ellipsis line-clamp-2"
                      >
                        {n.body}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{timeAgo(n.createdAt)}</span>
                        {n.link && (
                          <span className="text-primary font-bold text-[10px]">
                            عرض ←
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer — mark all read */}
          <div
            className="py-2 px-2.5 border-t border-border bg-card"
          >
            <button
              type="button"
              onClick={markAllRead}
              disabled={markingAll || unreadCount === 0}
              className={cn("w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-transparent border border-border text-foreground cursor-pointer font-inherit text-xs font-bold", markingAll || unreadCount === 0 ? "opacity-50" : "")}
            >
              <CheckCheck size={13} />
              {markingAll ? "جارٍ…" : "تعليم الكل كمقروء"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationsDropdown;
