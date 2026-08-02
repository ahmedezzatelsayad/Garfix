"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { Ticket, TicketReply } from "./types";
import {
  useUpdatePlatformTicket,
  useReplyToTicket,
} from "@/hooks/queries";

/**
 * GATE 4 / Admin P1.1 — Ticket Detail Drawer.
 * Uses TanStack Query mutations for ticket status updates and replies.
 */
export function TicketDetailDrawer({
  ticketId, tickets, onClose, onUpdated,
}: {
  ticketId: string;
  tickets: Ticket[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const ticket = tickets.find((t) => t.id === ticketId);
  const updateMutation = useUpdatePlatformTicket();
  const replyMutation = useReplyToTicket();

  const [replyBody, setReplyBody] = useState("");
  const [status, setStatus] = useState(ticket?.status || "open");
  const [sending, setSending] = useState(false);
  const [localReplies, setLocalReplies] = useState<TicketReply[]>(ticket?.replies || []);

  if (!ticket) {
    return null;
  }

  const sendReply = async () => {
    if (!replyBody.trim()) return;
    setSending(true);
    try {
      const data = await replyMutation.mutateAsync({ id: parseInt(ticketId), message: replyBody.trim() });
      const reply = (data as unknown as Record<string, unknown>)?.reply as TicketReply | undefined;
      if (reply) setLocalReplies((prev) => [...prev, reply]);
      setReplyBody("");
      toast.success("تم إرسال الرد");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (newStatus: string) => {
    setStatus(newStatus);
    try {
      await updateMutation.mutateAsync({ id: parseInt(ticketId), status: newStatus });
      toast.success(`تم تحديث الحالة إلى: ${newStatus}`);
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    }
  };

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="left"
        dir="rtl"
        className="w-full sm:w-[min(640px,100vw)] max-w-none !gap-3 sm:!gap-3.5 overflow-y-auto p-3 sm:p-5 shadow-brand-xl glass-strong"
        aria-describedby={undefined}
      >
        <SheetHeader className="p-0 !gap-1">
          <SheetTitle className="text-right text-[15px] font-extrabold">
            {ticket.subject}
          </SheetTitle>
          <SheetDescription className="text-right text-[11px]" dir="ltr">
            <span className="[direction:ltr]">
              {ticket.userEmail} • {new Date(ticket.createdAt).toLocaleString("ar-EG")} • الأولوية: {ticket.priority}
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex gap-2 items-center">
          <label className="text-[11px] font-bold text-[var(--muted-foreground)]">الحالة:</label>
          <select value={status} onChange={(e) => changeStatus(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-inherit text-[13px] outline-none max-w-[180px] focus-ring transition-all">
            <option value="open">مفتوحة</option>
            <option value="pending">بانتظار المستخدم</option>
            <option value="resolved">تم الحل</option>
            <option value="closed">مغلقة</option>
          </select>
        </div>

        {ticket.body && (
          <div className="p-2 sm:p-3 bg-[var(--muted)] rounded-[10px] text-[13px] leading-relaxed glass">
            <div className="text-[10px] text-[var(--muted-foreground)] mb-1.5 font-bold">الرسالة الأصلية:</div>
            {ticket.body}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-bold text-[var(--muted-foreground)]">الردود ({localReplies.length}):</div>
          {localReplies.length === 0 ? (
            <div className="text-xs text-[var(--muted-foreground)] p-2">لا توجد ردود بعد</div>
          ) : (
            localReplies.map((r) => (
              <div className="p-2 sm:p-2.5 bg-[var(--card)] rounded-lg border border-[var(--border)] glass" key={r.id}>
                <div className="flex justify-between mb-1 text-[10px] text-[var(--muted-foreground)]">
                  <span className="font-bold">{r.senderEmail} ({r.senderRole})</span>
                  <span>{new Date(r.createdAt).toLocaleString("ar-EG")}</span>
                </div>
                <div className="text-xs leading-relaxed">{r.body}</div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col gap-2 mt-2">
          <label className="block text-[11px] font-semibold text-[var(--muted-foreground)] mb-1">إضافة رد:</label>
          <Textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            rows={3}
            className="resize-y min-h-[80px] focus-ring transition-all"
            placeholder="اكتب ردك هنا…"
          />
          <button
            onClick={sendReply}
            disabled={sending || !replyBody.trim()}
            className="self-end inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] border-none font-inherit text-xs font-bold active-press duration-150" /* TAILWINDBREAK: dynamic cursor/opacity */ style={{ cursor: sending ? "not-allowed" : "pointer", opacity: (sending || !replyBody.trim()) ? 0.6 : 1 }}
          >
            <Send size={14} /> {sending ? "جارٍ…" : "إرسال الرد"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
