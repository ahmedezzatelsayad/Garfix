// Responsive: sm/md/lg breakpoints added
"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { apiGet, ApiError } from "@/hooks/api-client";
import {
  BookOpen, Calendar, Download, Printer, Search, Filter,
  ChevronRight, ChevronLeft, RefreshCw, ArrowUpDown,
  FileText, Eye, TrendingUp, TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [searchAccount, setSearchAccount] = useState("");
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
  });
  const [showSummary, setShowSummary] = useState(true);

  // Fetch accounts on mount
  useEffect(() => {
    apiGet<any>(`/api/accounting/accounts?companySlug=${companySlug}`)
      .then((res) => {
        setAccounts(res.accounts || []);
        // Auto-select first account if none selected
        if (res.accounts?.length > 0 && !selectedAccountId) {
          setSelectedAccountId(res.accounts[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setAccountsLoading(false));
  }, [companySlug]);

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
      console.error("Error fetching general ledger:", err);
      toast.error("خطأ في تحميل الأستاذ العام");
    } finally {
      setLoading(false);
    }
  }, [companySlug, selectedAccountId, fromDate, toDate, pagination.page, pagination.pageSize]);

  useEffect(() => {
    if (selectedAccountId) {
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-emerald-600" />
            الأستاذ العام
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
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
              "bg-blue-50 hover:bg-blue-100 text-blue-700",
              "dark:bg-blue-900/20 dark:hover:bg-blue-900/30 dark:text-blue-400",
              "transition-colors"
            )}
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">طباعة</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Account Selector */}
          <div className="lg:col-span-1 relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              الحساب
            </label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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
                  "border border-gray-200 dark:border-gray-600",
                  "bg-white dark:bg-gray-700",
                  "text-gray-900 dark:text-white",
                  "focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                )}
              />
              
              {showAccountDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredAccounts.length === 0 ? (
                    <div className="px-4 py-3 text-gray-500 text-sm">لا توجد حسابات</div>
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
                          "w-full px-4 py-2 text-right hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors",
                          selectedAccountId === acc.id && "bg-emerald-100 dark:bg-emerald-900/30"
                        )}
                      >
                        <span className="font-medium">{acc.code}</span>
                        <span className="mr-2 text-gray-600 dark:text-gray-400">
                          {acc.nameAr || acc.name}
                        </span>
                        <span className="text-xs text-gray-400 mr-2">({acc.type})</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* From Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              من تاريخ
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={cn(
                "w-full px-4 py-2 rounded-lg",
                "border border-gray-200 dark:border-gray-600",
                "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                "focus:ring-2 focus:ring-emerald-500"
              )}
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              إلى تاريخ
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={cn(
                "w-full px-4 py-2 rounded-lg",
                "border border-gray-200 dark:border-gray-600",
                "bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
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
                "bg-emerald-600 hover:bg-emerald-700 text-white",
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
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden print:shadow-none print:border-0">
          {/* Account Header */}
          <div className="px-6 py-4 bg-gradient-to-l from-emerald-50 to-white dark:from-emerald-900/20 dark:to-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {ledgerData.account.nameAr || ledgerData.account.name}
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
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
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                )}
              >
                <Eye className="w-4 h-4" />
                {showSummary ? "إخفاء الملخص" : "عرض الملخص"}
              </button>
            </div>

            {/* Summary Cards */}
            {showSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                  <div className="text-xs text-gray-500 mb-1">رصيد افتتاحي</div>
                  <div className={cn(
                    "font-bold",
                    ledgerData.openingBalance.net >= 0 ? "text-gray-900 dark:text-white" : "text-red-600"
                  )}>
                    {formatCurrency(ledgerData.openingBalance.net)}
                  </div>
                </div>
                
                <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                  <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-emerald-600" />
                    إجمالي مدين
                  </div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(ledgerData.totals.totalDebits)}
                  </div>
                </div>
                
                <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                  <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-red-600" />
                    إجمالي دائن
                  </div>
                  <div className="font-bold text-red-600 dark:text-red-400">
                    {formatCurrency(ledgerData.totals.totalCredits)}
                  </div>
                </div>
                
                <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                  <div className="text-xs text-gray-500 mb-1">رصيد اختتامي</div>
                  <div className={cn(
                    "font-bold",
                    ledgerData.closingBalance.net >= 0 ? "text-gray-900 dark:text-white" : "text-red-600"
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
              <span className="mr-3 text-gray-500">جاري التحميل...</span>
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        التاريخ
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        المرجع
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                        البيان
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        مدين
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        دائن
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        الرصيد
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {/* Opening Balance Row */}
                    <tr className="bg-gray-50/50 dark:bg-gray-900/30 font-medium">
                      <td colSpan={3} className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        رصيد افتتاحي
                      </td>
                      <td className="px-4 py-3 text-left text-gray-600 dark:text-gray-400">
                        {formatCurrency(ledgerData.openingBalance.debit)}
                      </td>
                      <td className="px-4 py-3 text-left text-gray-600 dark:text-gray-400">
                        {formatCurrency(ledgerData.openingBalance.credit)}
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-left font-bold",
                        ledgerData.openingBalance.net >= 0 ? "text-gray-900 dark:text-white" : "text-red-600"
                      )}>
                        {formatCurrency(ledgerData.openingBalance.net)}
                      </td>
                    </tr>

                    {/* Entry Rows */}
                    {ledgerData.entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer group"
                        onClick={() => {
                          // Navigate to source document - would open a modal or navigate
                          toast.info(`قيد رقم: ${entry.journalEntryNumber}`);
                        }}
                      >
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                          {formatDate(entry.date)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded">
                            {entry.journalEntryNumber}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hidden sm:table-cell max-w-[300px] truncate">
                          {entry.description || entry.reference || "—"}
                        </td>
                        <td className="px-4 py-3 text-left text-sm text-gray-900 dark:text-white">
                          {entry.debit > 0 ? formatCurrency(entry.debit) : ""}
                        </td>
                        <td className="px-4 py-3 text-left text-sm text-gray-900 dark:text-white">
                          {entry.credit > 0 ? formatCurrency(entry.credit) : ""}
                        </td>
                        <td className={cn(
                          "px-4 py-3 text-left text-sm font-medium",
                          entry.balance >= 0 ? "text-gray-900 dark:text-white" : "text-red-600"
                        )}>
                          {formatCurrency(entry.balance)}
                        </td>
                      </tr>
                    ))}

                    {/* Totals Row */}
                    <tr className="bg-emerald-50 dark:bg-emerald-900/20 font-bold">
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
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-sm text-gray-500">
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
                        "border border-gray-200 dark:border-gray-600",
                        "hover:bg-gray-100 dark:hover:bg-gray-700",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400">
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
                        "border border-gray-200 dark:border-gray-600",
                        "hover:bg-gray-100 dark:hover:bg-gray-700",
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
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-12 text-center">
          <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">الأستاذ العام</h3>
          <p className="text-gray-500 mt-2">
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
