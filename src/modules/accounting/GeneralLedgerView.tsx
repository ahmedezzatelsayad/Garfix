// Responsive: sm/md/lg breakpoints added
"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { apiGet } from "@/hooks/api-client";
import {
  BookOpen, Download, Printer, Search,
  ChevronRight, ChevronLeft, RefreshCw, Eye, TrendingUp, TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface GeneralLedgerEntry {
  id: string;
  date: string;
  reference: string | null;
  description: string | null;
  debit: number;
  credit: number;
  balance: number;
  journalEntryId: string;
  journalEntryNumber: string;
}

interface GeneralLedgerResponse {
  account: {
    id: string;
    code: string;
    name: string;
    nameAr: string | null;
    type: string;
  } | null;
  openingBalance: {
    debit: number;
    credit: number;
    net: number;
  };
  entries: GeneralLedgerEntry[];
  closingBalance: {
    debit: number;
    credit: number;
    net: number;
  };
  totals: {
    totalDebits: number;
    totalCredits: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
  nameAr?: string;
  type: string;
}

/* ─── Main Component ────────────────────────────────────────────────────────── */

export function GeneralLedgerView({ companySlug }: { companySlug: string }) {
  // State
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>(
    new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
  );
  const [toDate, setToDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [loading, setLoading] = useState(false);
  const [ledgerData, setLedgerData] = useState<GeneralLedgerResponse | null>(null);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [_accountsLoading, setAccountsLoading] = useState(true);
  const [searchAccount, setSearchAccount] = useState("");
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
  });
  const [showSummary, setShowSummary] = useState(true);

  // Fetch accounts on mount
  useEffect(() => {
    apiGet<{ accounts: AccountOption[] }>(`/api/accounting/accounts?companySlug=${companySlug}`)
      .then((res) => {
        setAccounts(res.accounts || []);
        // Auto-select first account if none selected
        if (res.accounts?.length > 0 && !selectedAccountId) {
          setSelectedAccountId(res.accounts[0].id);
        }
      })
      .catch((err: unknown) => logger.error("Error fetching GL accounts", { err }))
      .finally(() => setAccountsLoading(false));
  }, [companySlug, selectedAccountId]);

  // Fetch ledger data when selection changes
  const fetchLedger = useCallback(async () => {
    if (!selectedAccountId) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        companySlug,
        accountId: selectedAccountId,
        fromDate,
        toDate,
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });

      const response = await apiGet<GeneralLedgerResponse>(
        `/api/accounting/reports/general-ledger?${params.toString()}`
      );
      
      setLedgerData(response);
    } catch (err) {
      logger.error("Error fetching general ledger:", { err });
      toast.error("خطأ في تحميل الأستاذ العام");
    } finally {
      setLoading(false);
    }
  }, [companySlug, selectedAccountId, fromDate, toDate, pagination.page, pagination.pageSize]);

  useEffect(() => {
    if (selectedAccountId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetching when account changes
      fetchLedger();
    }
  }, [fetchLedger, selectedAccountId]);

  // Filter accounts for dropdown
  const filteredAccounts = accounts.filter(
    (acc) =>
      acc.code.toLowerCase().includes(searchAccount.toLowerCase()) ||
      acc.name.toLowerCase().includes(searchAccount.toLowerCase()) ||
      (acc.nameAr && acc.nameAr.includes(searchAccount))
  );

  // Get selected account info
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("ar-EG", {
      style: "currency",
      currency: "SAR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Export handlers
  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    toast.info("جاري تحضير ملف PDF...");
    // PDF export would be implemented with a library like jsPDF or server-side
  };

  const handleExportExcel = () => {
    toast.info("جاري تحضير ملف Excel...");
    // Excel export would be implemented with a library like xlsx or server-side
  };

  /* ─── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-emerald-600" />
            الأستاذ العام
          </h2>
          <p className="text-muted-foreground mt-1">
            عرض تفصيلي لحركات الحساب مع الرصيد الجاري
          </p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={handleExportPDF}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm",
              "bg-red-50 hover:bg-red-100 text-red-700",
              "dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-400",
              "transition-colors"
            )}
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">PDF</span>
          </button>
          <button
            onClick={handleExportExcel}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm",
              "bg-green-50 hover:bg-green-100 text-green-700",
              "dark:bg-green-900/20 dark:hover:bg-green-900/30 dark:text-green-400",
              "transition-colors"
            )}
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Excel</span>
          </button>
          <button
            onClick={handlePrint}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm",
              "bg-mutedackgroundlue-50 hover:bg-mutedackgroundlue-100 text-blue-700",
              "dark:bg-mutedackgroundlue-900/20 dark:hover:bg-mutedackgroundlue-900/30 dark:text-blue-400",
              "transition-colors"
            )}
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">طباعة</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl shadow-sm border border-border p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Account Selector */}
          <div className="lg:col-span-1 relative">
            <label className="block text-sm font-medium text-foreground mb-1">
              الحساب
            </label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={
                  selectedAccount
                    ? `${selectedAccount.code} - ${selectedAccount.nameAr || selectedAccount.name}`
                    : searchAccount
                }
                onChange={(e) => {
                  setSearchAccount(e.target.value);
                  setShowAccountDropdown(true);
                }}
                onFocus={() => setShowAccountDropdown(true)}
                placeholder="ابحث عن حساب..."
                className={cn(
                  "w-full pr-10 pl-4 py-2 rounded-lg",
                  "border border-border",
                  "bg-white dark:bg-gray-700",
                  "text-foreground",
                  "focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                )}
              />
              
              {showAccountDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredAccounts.length === 0 ? (
                    <div className="px-4 py-3 text-muted-foreground text-sm">لا توجد حسابات</div>
                  ) : (
                    filteredAccounts.map((acc) => (
                      <button
                        key={acc.id}
                        onClick={() => {
                          setSelectedAccountId(acc.id);
                          setSearchAccount("");
                          setShowAccountDropdown(false);
                        }}
                        className={cn(
                          "w-full px-4 py-2 text-right hover:bg-mutedmerald-50 dark:hover:bg-mutedmerald-900/20 transition-colors",
                          selectedAccountId === acc.id && "bg-mutedmerald-100 dark:bg-mutedmerald-900/30"
                        )}
                      >
                        <span className="font-medium">{acc.code}</span>
                        <span className="mr-2 text-muted-foreground">
                          {acc.nameAr || acc.name}
                        </span>
                        <span className="text-xs text-muted-foreground mr-2">({acc.type})</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* From Date */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              من تاريخ
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={cn(
                "w-full px-4 py-2 rounded-lg",
                "border border-border",
                "bg-white dark:bg-gray-700 text-foreground",
                "focus:ring-2 focus:ring-emerald-500"
              )}
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              إلى تاريخ
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={cn(
                "w-full px-4 py-2 rounded-lg",
                "border border-border",
                "bg-white dark:bg-gray-700 text-foreground",
                "focus:ring-2 focus:ring-emerald-500"
              )}
            />
          </div>

          {/* Refresh Button */}
          <div className="flex items-end">
            <button
              onClick={fetchLedger}
              disabled={loading || !selectedAccountId}
              className={cn(
                "w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium",
                "bg-mutedmerald-600 hover:bg-mutedmerald-700 text-white",
                "transition-colors disabled:opacity-50",
                "shadow-brand hover:shadow-brand-md"
              )}
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              عرض
            </button>
          </div>
        </div>
      </div>

      {/* Ledger Content */}
      {ledgerData && ledgerData.account ? (
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden print:shadow-none print:border-0">
          {/* Account Header */}
          <div className="px-6 py-4 bg-gradient-to-l from-emerald-50 to-white dark:from-emerald-900/20 dark:to-card border-b border-border">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-foreground">
                  {ledgerData.account.nameAr || ledgerData.account.name}
                </h3>
                <p className="text-muted-foreground">
                  رمز الحساب: <span className="font-mono font-medium">{ledgerData.account.code}</span>
                  {" | "}
                  نوع الحساب:{" "}
                  <span className="capitalize">
                    {ledgerData.account.type === "asset" ? "أصول" :
                     ledgerData.account.type === "liability" ? "التزامات" :
                     ledgerData.account.type === "equity" ? "حقوق ملكية" :
                     ledgerData.account.type === "revenue" ? "إيرادات" :
                     ledgerData.account.type === "expense" ? "مصروفات" : ledgerData.account.type}
                  </span>
                </p>
              </div>
              
              <button
                onClick={() => setShowSummary(!showSummary)}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  showSummary 
                    ? "bg-mutedmerald-100 text-emerald-700 dark:bg-mutedmerald-900/30 dark:text-emerald-400"
                    : "bg-muted text-gray-700 dark:bg-gray-700 dark:text-muted-foreground"
                )}
              >
                <Eye className="w-4 h-4" />
                {showSummary ? "إخفاء الملخص" : "عرض الملخص"}
              </button>
            </div>

            {/* Summary Cards */}
            {showSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div className="p-3 bg-card rounded-lg border border-border">
                  <div className="text-xs text-muted-foreground mb-1">رصيد افتتاحي</div>
                  <div className={cn(
                    "font-bold",
                    ledgerData.openingBalance.net >= 0 ? "text-foreground" : "text-red-600"
                  )}>
                    {formatCurrency(ledgerData.openingBalance.net)}
                  </div>
                </div>
                
                <div className="p-3 bg-card rounded-lg border border-border">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-emerald-600" />
                    إجمالي مدين
                  </div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(ledgerData.totals.totalDebits)}
                  </div>
                </div>
                
                <div className="p-3 bg-card rounded-lg border border-border">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-red-600" />
                    إجمالي دائن
                  </div>
                  <div className="font-bold text-red-600 dark:text-red-400">
                    {formatCurrency(ledgerData.totals.totalCredits)}
                  </div>
                </div>
                
                <div className="p-3 bg-card rounded-lg border border-border">
                  <div className="text-xs text-muted-foreground mb-1">رصيد اختتامي</div>
                  <div className={cn(
                    "font-bold",
                    ledgerData.closingBalance.net >= 0 ? "text-foreground" : "text-red-600"
                  )}>
                    {formatCurrency(ledgerData.closingBalance.net)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Loading State */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
              <span className="mr-3 text-muted-foreground">جاري التحميل...</span>
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        التاريخ
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        المرجع
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                        البيان
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        مدين
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        دائن
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        الرصيد
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {/* Opening Balance Row */}
                    <tr className="bg-gray-50/50 dark:bg-gray-900/30 font-medium">
                      <td colSpan={3} className="px-4 py-3 text-muted-foreground">
                        رصيد افتتاحي
                      </td>
                      <td className="px-4 py-3 text-left text-muted-foreground">
                        {formatCurrency(ledgerData.openingBalance.debit)}
                      </td>
                      <td className="px-4 py-3 text-left text-muted-foreground">
                        {formatCurrency(ledgerData.openingBalance.credit)}
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-left font-bold",
                        ledgerData.openingBalance.net >= 0 ? "text-foreground" : "text-red-600"
                      )}>
                        {formatCurrency(ledgerData.openingBalance.net)}
                      </td>
                    </tr>

                    {/* Entry Rows */}
                    {ledgerData.entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="hover:bg-muted dark:hover:bg-gray-700/50 transition-colors cursor-pointer group"
                        onClick={() => {
                          // Navigate to source document - would open a modal or navigate
                          toast.info(`قيد رقم: ${entry.journalEntryNumber}`);
                        }}
                      >
                        <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                          {formatDate(entry.date)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="font-mono text-emerald-600 dark:text-emerald-400 bg-mutedmerald-50 dark:bg-mutedmerald-900/20 px-2 py-0.5 rounded">
                            {entry.journalEntryNumber}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell max-w-[300px] truncate">
                          {entry.description || entry.reference || "—"}
                        </td>
                        <td className="px-4 py-3 text-left text-sm text-foreground">
                          {entry.debit > 0 ? formatCurrency(entry.debit) : ""}
                        </td>
                        <td className="px-4 py-3 text-left text-sm text-foreground">
                          {entry.credit > 0 ? formatCurrency(entry.credit) : ""}
                        </td>
                        <td className={cn(
                          "px-4 py-3 text-left text-sm font-medium",
                          entry.balance >= 0 ? "text-foreground" : "text-red-600"
                        )}>
                          {formatCurrency(entry.balance)}
                        </td>
                      </tr>
                    ))}

                    {/* Totals Row */}
                    <tr className="bg-mutedmerald-50 dark:bg-mutedmerald-900/20 font-bold">
                      <td colSpan={3} className="px-4 py-3 text-emerald-800 dark:text-emerald-300">
                        الإجمالي / رصيد اختتامي
                      </td>
                      <td className="px-4 py-3 text-left text-emerald-800 dark:text-emerald-300">
                        {formatCurrency(ledgerData.totals.totalDebits)}
                      </td>
                      <td className="px-4 py-3 text-left text-emerald-800 dark:text-emerald-300">
                        {formatCurrency(ledgerData.totals.totalCredits)}
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-left font-bold",
                        ledgerData.closingBalance.net >= 0 
                          ? "text-emerald-800 dark:text-emerald-300" 
                          : "text-red-600"
                      )}>
                        {formatCurrency(ledgerData.closingBalance.net)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {ledgerData.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                  <div className="text-sm text-muted-foreground">
                    عرض {(ledgerData.pagination.page - 1) * ledgerData.pagination.pageSize + 1} -{" "}
                    {Math.min(
                      ledgerData.pagination.page * ledgerData.pagination.pageSize,
                      ledgerData.pagination.totalItems
                    )}{" "}
                    من {ledgerData.pagination.totalItems} حركة
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setPagination((p) => ({
                          ...p,
                          page: p.page - 1,
                        }))
                      }
                      disabled={ledgerData.pagination.page <= 1}
                      className={cn(
                        "px-3 py-1 rounded-lg text-sm font-medium transition-colors",
                        "border border-border",
                        "hover:bg-muted dark:hover:bg-gray-700",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <span className="px-3 py-1 text-sm text-muted-foreground">
                      {ledgerData.pagination.page} / {ledgerData.pagination.totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setPagination((p) => ({
                          ...p,
                          page: p.page + 1,
                        }))
                      }
                      disabled={ledgerData.pagination.page >= ledgerData.pagination.totalPages}
                      className={cn(
                        "px-3 py-1 rounded-lg text-sm font-medium transition-colors",
                        "border border-border",
                        "hover:bg-muted dark:hover:bg-gray-700",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-card rounded-xl shadow-sm border border-border p-12 text-center">
          <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium text-foreground">الأستاذ العام</h3>
          <p className="text-muted-foreground mt-2">
            اختر حساباً لعرض حركاته التفصيلية مع الرصيد الجاري
          </p>
        </div>
      )}

      {/* Click outside to close dropdown */}
      {showAccountDropdown && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowAccountDropdown(false)}
        />
      )}
    </div>
  );
}

export default GeneralLedgerView;
