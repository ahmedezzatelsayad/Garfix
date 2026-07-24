"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { authedFetch } from "@/context/AuthContext";
import {
  History, Search, Download, Filter, RefreshCw, ChevronLeft, ChevronRight,
  Eye, Wifi, WifiOff, X, FileSpreadsheet, User, Building2, Calendar,
  Shield, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

/* ── Types ───────────────────────────────────────────────────────────── */

interface AuditLog {
  id: number;
  userEmail: string;
  userUid: string;
  action: string;
  entity: string;
  entityId?: string | null;
  companySlug?: string | null;
  details?: Record<string, unknown> | null;
  createdAt: string;
}

interface FilterState {
  action: string;
  companySlug: string;
  userEmail: string;
  startDate: string;
  endDate: string;
}

const ACTION_OPTIONS = [
  { value: "", label: "كل الإجراءات" },
  { value: "create", label: "إنشاء" },
  { value: "update", label: "تحديث" },
  { value: "delete", label: "حذف" },
  { value: "login_success", label: "تسجيل دخول ناجح" },
  { value: "login_failure", label: "تسجيل دخول فاشل" },
  { value: "logout", label: "تسجيل خروج" },
  { value: "register", label: "تسجيل حساب" },
  { value: "payment", label: "دفعة" },
  { value: "status_change", label: "تغيير حالة" },
  { value: "ai_chat", label: "محادثة AI" },
];

const PAGE_SIZE = 20;

/* ── Action Badge Color ──────────────────────────────────────────────── */

function getActionColor(action: string): string {
  if (action.includes("create")) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (action.includes("update")) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  if (action.includes("delete")) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (action.includes("login_success")) return "bg-green-500/20 text-green-400 border-green-500/30";
  if (action.includes("login_failure")) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (action.includes("payment")) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  if (action.includes("ai")) return "bg-purple-500/20 text-purple-400 border-purple-500/30";
  return "bg-white/10 text-white/60 border-white/20";
}

/* ── Component ────────────────────────────────────────────────────────── */

export function EnhancedAuditView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    action: "",
    companySlug: "",
    userEmail: "",
    startDate: "",
    endDate: "",
  });
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Online status
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const onOffline = () => setIsOnline(false);
    const onOnline = () => setIsOnline(true);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const load = useCallback(async () => {
    setIsRefreshing(true);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.action) params.set("action", filters.action);
      if (filters.companySlug) params.set("companySlug", filters.companySlug);
      if (filters.userEmail) params.set("userEmail", filters.userEmail);
      if (filters.startDate) params.set("startDate", filters.startDate);
      if (filters.endDate) params.set("endDate", filters.endDate);
      params.set("limit", "500");
      const res = await authedFetch(`/api/audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch {
      // Graceful error handling
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [filters.action, filters.companySlug, filters.userEmail, filters.startDate, filters.endDate]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Client-side filtering + pagination
  const filteredLogs = useMemo(() => {
    let result = logs;

    if (filters.userEmail) {
      const q = filters.userEmail.toLowerCase();
      result = result.filter((l) => l.userEmail.toLowerCase().includes(q));
    }
    if (filters.action) {
      result = result.filter((l) => l.action === filters.action);
    }
    if (filters.companySlug) {
      result = result.filter((l) => l.companySlug === filters.companySlug);
    }
    if (filters.startDate) {
      result = result.filter((l) => new Date(l.createdAt) >= new Date(filters.startDate));
    }
    if (filters.endDate) {
      result = result.filter((l) => new Date(l.createdAt) <= new Date(filters.endDate + "T23:59:59"));
    }

    return result;
  }, [logs, filters]);

  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredLogs.slice(start, start + PAGE_SIZE);
  }, [filteredLogs, page]);

  // Unique company slugs for filter dropdown
  const companySlugs = useMemo(() => {
    const slugs = new Set(logs.map((l) => l.companySlug).filter(Boolean));
    return Array.from(slugs) as string[];
  }, [logs]);

  // Export to CSV
  const exportCSV = useCallback(() => {
    const headers = ["ID", "User", "Action", "Entity", "EntityID", "Company", "Details", "Date"];
    const rows = filteredLogs.map((l) => [
      l.id,
      l.userEmail,
      l.action,
      l.entity,
      l.entityId || "",
      l.companySlug || "",
      l.details ? JSON.stringify(l.details) : "",
      new Date(l.createdAt).toISOString(),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); // BOM for Arabic in Excel
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredLogs]);

  // Clear filters
  const clearFilters = () => {
    setFilters({ action: "", companySlug: "", userEmail: "", startDate: "", endDate: "" });
    setPage(1);
  };

  const hasFilters = filters.action || filters.companySlug || filters.userEmail || filters.startDate || filters.endDate;

  return (
    <div dir="rtl" className="flex flex-col gap-3 sm:gap-4">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold flex items-center gap-2">
            <History size={20} />
            سجل التدقيق
          </h1>
          <p className="text-[13px] text-[var(--muted-foreground)]">
            {filteredLogs.length} سجل {hasFilters ? `(مفلتر من ${logs.length})` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {/* Real-time status indicator */}
          <Badge
            variant="outline"
            className={cn(
              "text-[11px] font-bold",
              isOnline
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border-red-500/20"
            )}
          >
            {isOnline ? <Wifi size={12} className="ms-1" /> : <WifiOff size={12} className="ms-1" />}
            {isOnline ? "متصل" : "غير متصل"}
          </Badge>
          <Button variant="outline" size="sm" onClick={load} disabled={isRefreshing}>
            <RefreshCw size={14} className={cn("ms-1", isRefreshing && "animate-spin")} />
            تحديث
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={filteredLogs.length === 0}>
            <Download size={14} className="ms-1" />
            تصدير CSV
          </Button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Filter size={14} className="text-[var(--muted-foreground)]" />
              <span className="text-sm font-bold">الفلاتر</span>
            </div>

            <Select
              value={filters.action}
              onValueChange={(v) => setFilters((f) => ({ ...f, action: v }))}
            >
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="كل الإجراءات" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value || "__all__"}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.companySlug || "__all__"}
              onValueChange={(v) => setFilters((f) => ({ ...f, companySlug: v === "__all__" ? "" : v }))}
            >
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="كل الشركات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">كل الشركات</SelectItem>
                {companySlugs.map((slug) => (
                  <SelectItem key={slug} value={slug}>{slug}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative flex-1 min-w-0 sm:min-w-[180px] sm:max-w-[260px]">
              <Search size={14} className="absolute start-3 top-[50%] -translate-y-[50%] text-[var(--muted-foreground)]" />
              <Input
                placeholder="بحث بالبريد الإلكتروني..."
                value={filters.userEmail}
                onChange={(e) => setFilters((f) => ({ ...f, userEmail: e.target.value }))}
                className="ps-9"
                dir="ltr"
              />
            </div>

            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
              className="w-full sm:w-[140px]"
              placeholder="من تاريخ"
            />
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
              className="w-full sm:w-[140px]"
              placeholder="إلى تاريخ"
            />

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X size={14} className="ms-1" />
                إزالة الفلاتر
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Table ──────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-[var(--muted-foreground)]">
              <RefreshCw size={24} className="animate-spin mx-auto mb-3" />
              جارٍ التحميل…
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-[var(--muted-foreground)]">
              <History size={24} className="mx-auto mb-3 opacity-30" />
              لا توجد سجلات
              {hasFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3">
                  إزالة الفلاتر
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto garfix-scroll">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[var(--muted)]">
                    <TableHead className="text-right text-[11px] font-bold">
                      <Clock size={12} className="inline ms-1" />
                      الوقت
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-bold">
                      <User size={12} className="inline ms-1" />
                      المستخدم
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-bold">
                      <Shield size={12} className="inline ms-1" />
                      الإجراء
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-bold hidden md:table-cell">الكيان</TableHead>
                    <TableHead className="text-right text-[11px] font-bold hidden md:table-cell">المعرّف</TableHead>
                    <TableHead className="text-right text-[11px] font-bold">
                      <Building2 size={12} className="inline ms-1" />
                      الشركة
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-bold">تفاصيل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedLogs.map((l) => (
                    <TableRow key={l.id} className="cursor-pointer hover:bg-[var(--accent)]" onClick={() => setSelectedLog(l)}>
                      <TableCell className="text-[13px]">{new Date(l.createdAt).toLocaleString("ar-EG")}</TableCell>
                      <TableCell className="text-[13px] direction-ltr text-right" dir="ltr">{l.userEmail}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[11px] font-bold", getActionColor(l.action))}>
                          {l.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[13px] hidden md:table-cell">{l.entity}</TableCell>
                      <TableCell className="text-[13px] font-mono hidden md:table-cell">{l.entityId || "—"}</TableCell>
                      <TableCell className="text-[13px] font-mono">{l.companySlug || "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedLog(l)}>
                          <Eye size={14} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Pagination ─────────────────────────────────────────────── */}
      {!loading && filteredLogs.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-[var(--muted-foreground)]">
            عرض {(page - 1) * PAGE_SIZE + 1} — {Math.min(page * PAGE_SIZE, filteredLogs.length)} من {filteredLogs.length}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronRight size={16} /> {/* RTL: right = previous */}
            </Button>
            <span className="text-sm font-bold">{page}</span>
            <span className="text-[13px] text-[var(--muted-foreground)]">/ {totalPages}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronLeft size={16} /> {/* RTL: left = next */}
            </Button>
          </div>
        </div>
      )}

      {/* ── Detail Modal ───────────────────────────────────────────── */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="sm:max-w-[560px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield size={16} />
              تفاصيل سجل التدقيق #{selectedLog?.id}
            </DialogTitle>
            <DialogDescription>
              عرض تفاصيل إجراء التدقيق
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--muted-foreground)] font-bold">
                    <Clock size={12} className="inline ms-1" />
                    الوقت
                  </span>
                  <span className="text-[13px]">{new Date(selectedLog.createdAt).toLocaleString("ar-EG")}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--muted-foreground)] font-bold">
                    <User size={12} className="inline ms-1" />
                    المستخدم
                  </span>
                  <span className="text-[13px]" dir="ltr">{selectedLog.userEmail}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--muted-foreground)] font-bold">
                    <Shield size={12} className="inline ms-1" />
                    الإجراء
                  </span>
                  <Badge variant="outline" className={cn("text-[11px] font-bold", getActionColor(selectedLog.action))}>
                    {selectedLog.action}
                  </Badge>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--muted-foreground)] font-bold">
                    <Building2 size={12} className="inline ms-1" />
                    الشركة
                  </span>
                  <span className="text-[13px] font-mono">{selectedLog.companySlug || "—"}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--muted-foreground)] font-bold">الكيان</span>
                  <span className="text-[13px]">{selectedLog.entity}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--muted-foreground)] font-bold">معرّف الكيان</span>
                  <span className="text-[13px] font-mono">{selectedLog.entityId || "—"}</span>
                </div>
              </div>

              {/* Details JSON */}
              {selectedLog.details && (
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--muted-foreground)] font-bold">تفاصيل إضافية</span>
                  <pre className="text-[12px] bg-[var(--muted)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed font-mono" dir="ltr">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-row-reverse">
            <Button variant="outline" onClick={() => setSelectedLog(null)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default EnhancedAuditView;
