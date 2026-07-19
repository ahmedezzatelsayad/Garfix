"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { authedFetch } from "@/context/AuthContext";
import { toast } from "sonner";
import { Bell, X, CheckCheck, BellOff } from "lucide-react";

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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/notifications");
      if (res.ok) {
        const data = (await res.json()) as NotificationsResponse;
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      // Silent fail — notification polling shouldn't toast on every error
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount + every 60 seconds
  // setState runs inside async .then() callback in load (after await authedFetch) — not synchronous in effect body; no cascading render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

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

  const markAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      const res = await authedFetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })));
        setUnreadCount(0);
        toast.success("تم تعليم جميع الإشعارات كمقروءة");
      } else {
        toast.error("تعذّر تحديث الإشعارات");
      }
    } catch {
      toast.error("خطأ في الاتصال");
    } finally {
      setMarkingAll(false);
    }
  }, []);

  const handleClickNotification = useCallback(async (n: Notification) => {
    // Optimistically mark as read
    if (!n.isRead) {
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, isRead: true, readAt: new Date().toISOString() } : x)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await authedFetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_read", id: n.id }),
        });
      } catch {
        // ignore — already updated UI optimistically
      }
    }
    setOpen(false);
    if (n.link) {
      // Support hash-route links (e.g. "#invoices") and full paths
      if (n.link.startsWith("#")) {
        window.location.hash = n.link.slice(1);
      } else {
        window.location.href = n.link;
      }
    }
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="الإشعارات"
        title="الإشعارات"
        style={{
          background: "var(--muted)", border: "1px solid var(--border)",
          width: "36px", height: "36px", borderRadius: "8px",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--muted-foreground)", cursor: "pointer", position: "relative",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "var(--muted)"; }}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute", top: "3px", right: "3px",
              minWidth: "16px", height: "16px", padding: "0 4px",
              borderRadius: "8px", background: "#ef4444", color: "#fff",
              fontSize: "9px", fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid var(--background)",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            width: "350px",
            maxHeight: "440px",
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "var(--card)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Bell size={14} style={{ color: "var(--primary)" }} />
              <span style={{ fontSize: "13px", fontWeight: 800 }}>الإشعارات</span>
              {unreadCount > 0 && (
                <span
                  style={{
                    background: "#ef4444", color: "#fff",
                    fontSize: "10px", fontWeight: 700, padding: "1px 7px",
                    borderRadius: "10px",
                  }}
                >
                  {unreadCount} غير مقروء
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="إغلاق"
              style={{
                background: "transparent", border: "none",
                color: "var(--muted-foreground)", cursor: "pointer",
                padding: "2px", borderRadius: "4px",
                display: "flex", alignItems: "center",
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* List */}
          <div
            style={{
              flex: 1, overflowY: "auto",
              padding: "4px",
            }}
            className="garfix-scroll"
          >
            {loading ? (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--muted-foreground)", fontSize: "12px" }}>
                جارٍ التحميل…
              </div>
            ) : notifications.length === 0 ? (
              <div
                style={{
                  padding: "40px 16px", textAlign: "center",
                  color: "var(--muted-foreground)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: "8px",
                }}
              >
                <BellOff size={28} style={{ opacity: 0.4 }} />
                <div style={{ fontSize: "12px" }}>لا توجد إشعارات</div>
              </div>
            ) : (
              notifications.map((n) => {
                const meta = TYPE_LABELS[n.type] || { label: n.type, color: "#7c3aed" };
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleClickNotification(n)}
                    style={{
                      width: "100%",
                      display: "flex", gap: "10px",
                      padding: "10px 12px", marginBottom: "2px",
                      borderRadius: "8px", border: "none",
                      background: n.isRead ? "transparent" : "var(--accent)",
                      color: "var(--popover-foreground)",
                      cursor: "pointer", fontFamily: "inherit",
                      textAlign: "right",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => { if (n.isRead) e.currentTarget.style.background = "var(--muted)"; }}
                    onMouseLeave={(e) => { if (n.isRead) e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* Unread dot */}
                    <div style={{ flexShrink: 0, paddingTop: "4px" }}>
                      <span
                        style={{
                          display: "block", width: "8px", height: "8px",
                          borderRadius: "50%",
                          background: n.isRead ? "transparent" : meta.color,
                          border: n.isRead ? `1px solid ${meta.color}80` : "none",
                        }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "12px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {n.title}
                        </span>
                        <span
                          style={{
                            fontSize: "9px", fontWeight: 700,
                            padding: "1px 6px", borderRadius: "8px",
                            background: `${meta.color}20`, color: meta.color,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "11px", color: "var(--muted-foreground)",
                          lineHeight: 1.5, marginBottom: "4px",
                          overflow: "hidden", textOverflow: "ellipsis",
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                        }}
                      >
                        {n.body}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "10px", color: "var(--muted-foreground)" }}>
                        <span>{timeAgo(n.createdAt)}</span>
                        {n.link && (
                          <span style={{ color: "var(--primary)", fontWeight: 700, fontSize: "10px" }}>
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
            style={{
              padding: "8px 10px",
              borderTop: "1px solid var(--border)",
              background: "var(--card)",
            }}
          >
            <button
              type="button"
              onClick={markAllRead}
              disabled={markingAll || unreadCount === 0}
              style={{
                width: "100%",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                padding: "8px", borderRadius: "8px",
                background: "transparent", border: "1px solid var(--border)",
                color: "var(--foreground)", cursor: "pointer", fontFamily: "inherit",
                fontSize: "12px", fontWeight: 700,
                opacity: markingAll || unreadCount === 0 ? 0.5 : 1,
              }}
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
