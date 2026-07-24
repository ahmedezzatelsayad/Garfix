/**
 * accounting.ts — React Query hooks for Accounting CRUD and report operations.
 *
 * Provides typed query and mutation hooks for chart of accounts,
 * journal entries (including reversal), and financial reports
 * (profit & loss, balance sheet, cash flow, trial balance). All hooks
 * use the centralized `queryKeys` factory for granular cache invalidation
 * and the typed `apiGet`/`apiPost`/`apiDelete` helpers for consistent requests.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete, apiUpload, apiDownloadBlob, ApiError } from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";
import { useCursorPagination, type CursorPage, type CursorPaginationParams } from "@/hooks/cursor-pagination";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Shape of an account record returned by the API. */
export interface Account {
  id: number;
  code: string;
  name: string;
  nameAr: string;
  nameEn?: string;
  type: string;
  balance: number;
  currency: string;
  companySlug: string;
  [key: string]: unknown;
}

/** A single line within a journal entry. */
export interface JournalLine {
  accountId: number;
  debit: number;
  credit: number;
}

/** Shape of a journal entry record returned by the API. */
export interface JournalEntry {
  id: number;
  date: string;
  description: string;
  lines: JournalLine[];
  companySlug: string;
  [key: string]: unknown;
}

// ─── Payload Types ──────────────────────────────────────────────────────────

/** Payload for creating a new account. */
export interface CreateAccountPayload {
  code: string;
  name: string;
  type: string;
  balance: number;
  companySlug: string;
  [key: string]: unknown;
}

/** Payload for creating a new journal entry. */
export interface CreateJournalEntryPayload {
  date: string;
  description: string;
  lines: JournalLine[];
  companySlug: string;
  [key: string]: unknown;
}

/** Payload for reversing a journal entry. */
export interface ReverseJournalEntryPayload {
  id: number;
  reason?: string;
  [key: string]: unknown;
}

// ─── Response Types ─────────────────────────────────────────────────────────

/** Response shape for the account list endpoint. */
interface AccountListResponse {
  accounts: Account[];
}

/** Response shape for a single account endpoint. */
interface AccountResponse {
  account: Account;
}

/** Response shape for the journal entry list endpoint. */
interface JournalEntryListResponse {
  journalEntries: JournalEntry[];
}

/** Response shape for a single journal entry endpoint. */
interface JournalEntryResponse {
  journalEntry: JournalEntry;
}

/** Response shape for the profit & loss report endpoint. */
export interface ProfitLossResponse {
  revenue: { total: number; items: { account: string; amount: number }[] };
  expenses: { total: number; items: { account: string; amount: number }[] };
  netIncome: number;
  [key: string]: unknown;
}

/** Response shape for the balance sheet report endpoint. */
export interface BalanceSheetResponse {
  assets: { total: number; items: { account: string; amount: number }[] };
  liabilities: { total: number; items: { account: string; amount: number }[] };
  equity: { total: number; items: { account: string; amount: number }[] };
  [key: string]: unknown;
}

/** Response shape for the cash flow report endpoint. */
export interface CashFlowResponse {
  operating: { total: number; items: { account: string; amount: number }[] };
  investing: { total: number; items: { account: string; amount: number }[] };
  financing: { total: number; items: { account: string; amount: number }[] };
  netChange: number;
  [key: string]: unknown;
}

/** Response shape for the trial balance report endpoint. */
export interface TrialBalanceResponse {
  lines: { accountCode: string; accountName: string; debit: number; credit: number }[];
  totalDebit: number;
  totalCredit: number;
  [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch the chart of accounts for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose accounts to fetch.
 */
export function useAccounts(companySlug: string) {
  return useQuery<AccountListResponse, ApiError>({
    queryKey: queryKeys.accounting.accounts(companySlug),
    queryFn: () =>
      apiGet<AccountListResponse>(
        `/api/accounting/accounts?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Create a new account in the chart of accounts.
 *
 * On success all account queries for the relevant company are
 * invalidated so every mounted list view refetches with the new entry.
 */
export function useCreateAccount() {
  const queryClient = useQueryClient();

  return useMutation<AccountResponse, ApiError, CreateAccountPayload>({
    mutationFn: (payload) =>
      apiPost<CreateAccountPayload, AccountResponse>(
        "/api/accounting/accounts",
        payload,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.accounts(variables.companySlug),
      });
    },
  });
}

/**
 * Delete a single account from the chart of accounts.
 *
 * On success all account queries are invalidated to ensure the
 * deleted entry no longer appears in any list.
 *
 * @param variables - Object containing the account `id` and `companySlug`.
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    ApiError,
    { id: number; companySlug: string }
  >({
    mutationFn: ({ id }) => apiDelete<void>(`/api/accounting/accounts/${id}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.accounts(variables.companySlug),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// JOURNAL ENTRY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch the list of journal entries for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose journal entries to fetch.
 */
export function useJournalEntries(companySlug: string) {
  return useQuery<JournalEntryListResponse, ApiError>({
    queryKey: queryKeys.accounting.journalEntries(companySlug),
    queryFn: () =>
      apiGet<JournalEntryListResponse>(
        `/api/accounting/journal-entries?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Create a new journal entry.
 *
 * On success all journal entry queries for the relevant company are
 * invalidated so every mounted list view refetches with the new entry.
 * Account queries are also invalidated since creating a journal entry
 * affects account balances.
 */
export function useCreateJournalEntry() {
  const queryClient = useQueryClient();

  return useMutation<JournalEntryResponse, ApiError, CreateJournalEntryPayload>({
    mutationFn: (payload) =>
      apiPost<CreateJournalEntryPayload, JournalEntryResponse>(
        "/api/accounting/journal-entries",
        payload,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.journalEntries(variables.companySlug),
      });
      // Account balances may have changed due to the new journal entry
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.accounts(variables.companySlug),
      });
    },
  });
}

/**
 * Delete a single journal entry.
 *
 * On success all journal entry queries for the relevant company are
 * invalidated. Account queries are also invalidated since deleting a
 * journal entry affects account balances.
 *
 * @param variables - Object containing the journal entry `id` and `companySlug`.
 */
export function useDeleteJournalEntry() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    ApiError,
    { id: number; companySlug: string }
  >({
    mutationFn: ({ id }) =>
      apiDelete<void>(`/api/accounting/journal-entries/${id}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.journalEntries(variables.companySlug),
      });
      // Account balances may have changed due to the deletion
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.accounts(variables.companySlug),
      });
    },
  });
}

/**
 * Reverse a journal entry by creating an offsetting entry.
 *
 * On success all journal entry queries for the relevant company are
 * invalidated, since the reversal creates a new entry. Account queries
 * and financial report queries are also invalidated as balances change.
 *
 * @param variables - Object containing the journal entry `id` and an optional `reason`.
 */
export function useReverseJournalEntry() {
  const queryClient = useQueryClient();

  return useMutation<
    JournalEntryResponse,
    ApiError,
    ReverseJournalEntryPayload
  >({
    mutationFn: (variables) => {
      const { id, ...body } = variables;
      return apiPost<typeof body, JournalEntryResponse>(
        `/api/accounting/journal-entries/${id}/reverse`,
        body,
      );
    },
    onSuccess: () => {
      // Invalidate all journal entry queries across all companies
      // since the payload may not contain companySlug
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === "accounting" &&
            key[1] === "journal-entries"
          );
        },
      });
      // Invalidate all account queries since balances may change
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === "accounting" &&
            key[1] === "accounts"
          );
        },
      });
      // Invalidate financial reports since they depend on journal entries
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key[0] === "accounting" &&
            (key[1] === "profit-loss" ||
              key[1] === "balance-sheet" ||
              key[1] === "cash-flow" ||
              key[1] === "trial-balance")
          );
        },
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FINANCIAL REPORT HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch the profit & loss report for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose P&L report to fetch.
 */
export function useProfitLoss(companySlug: string, from?: string, to?: string) {
  const params = new URLSearchParams({ companySlug });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return useQuery<ProfitLossResponse, ApiError>({
    queryKey: [...queryKeys.accounting.profitLoss(companySlug), { from, to }],
    queryFn: () =>
      apiGet<ProfitLossResponse>(
        `/api/accounting/profit-loss?${params.toString()}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Fetch the balance sheet report for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose balance sheet to fetch.
 */
export function useBalanceSheet(companySlug: string, asOf?: string) {
  const params = new URLSearchParams({ companySlug });
  if (asOf) params.set("asOf", asOf);
  return useQuery<BalanceSheetResponse, ApiError>({
    queryKey: [...queryKeys.accounting.balanceSheet(companySlug), { asOf }],
    queryFn: () =>
      apiGet<BalanceSheetResponse>(
        `/api/accounting/balance-sheet?${params.toString()}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Fetch the cash flow report for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose cash flow report to fetch.
 */
export function useCashFlow(companySlug: string, from?: string, to?: string) {
  const params = new URLSearchParams({ companySlug });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return useQuery<CashFlowResponse, ApiError>({
    queryKey: [...queryKeys.accounting.cashFlow(companySlug), { from, to }],
    queryFn: () =>
      apiGet<CashFlowResponse>(
        `/api/accounting/cash-flow?${params.toString()}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Fetch the trial balance report for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose trial balance to fetch.
 */
export function useTrialBalance(companySlug: string) {
  return useQuery<TrialBalanceResponse, ApiError>({
    queryKey: queryKeys.accounting.trialBalance(companySlug),
    queryFn: () =>
      apiGet<TrialBalanceResponse>(
        `/api/accounting/trial-balance?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — FISCAL PERIOD HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/** Response shape for fiscal periods. */
interface FiscalPeriodListResponse {
  periods: Array<{
    id: number; name: string; startDate: string; endDate: string;
    status: string; closedAt?: string; companySlug: string;
  }>;
}

/** Payload for creating a fiscal period. */
interface CreateFiscalPeriodPayload {
  name: string; startDate: string; endDate: string; companySlug: string;
}

export function useFiscalPeriods(companySlug: string) {
  return useQuery<FiscalPeriodListResponse, ApiError>({
    queryKey: queryKeys.accounting.fiscalPeriods(companySlug),
    queryFn: () =>
      apiGet<FiscalPeriodListResponse>(
        `/api/accounting/fiscal-periods?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useCloseFiscalPeriod() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: number; companySlug: string }>({
    mutationFn: ({ id, companySlug }) =>
      apiPost<void, void>(
        `/api/accounting/fiscal-periods/${id}/close?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.fiscalPeriods(variables.companySlug),
      });
    },
  });
}

export function useReopenFiscalPeriod() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: number; companySlug: string }>({
    mutationFn: ({ id, companySlug }) =>
      apiPost<void, void>(
        `/api/accounting/fiscal-periods/${id}/reopen?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.fiscalPeriods(variables.companySlug),
      });
    },
  });
}

export function useCreateFiscalPeriod() {
  const queryClient = useQueryClient();
  return useMutation<FiscalPeriodListResponse, ApiError, CreateFiscalPeriodPayload>({
    mutationFn: (payload) =>
      apiPost<CreateFiscalPeriodPayload, FiscalPeriodListResponse>(
        "/api/accounting/fiscal-periods", payload,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.fiscalPeriods(variables.companySlug),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — COST CENTER HOOKS
// ═══════════════════════════════════════════════════════════════════════════

interface CostCenterListResponse {
  costCenters: Array<{
    id: number; code: string; nameAr: string; parentId?: number | null;
    type: string; budget?: number; actual?: number; companySlug: string;
  }>;
}

interface CreateCostCenterPayload {
  code: string; nameAr: string; type: string; parentId?: number;
  budget?: number; companySlug: string;
}

export function useCostCenters(companySlug: string) {
  return useQuery<CostCenterListResponse, ApiError>({
    queryKey: queryKeys.accounting.costCenters(companySlug),
    queryFn: () =>
      apiGet<CostCenterListResponse>(
        `/api/accounting/cost-centers?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useCreateCostCenter() {
  const queryClient = useQueryClient();
  return useMutation<CostCenterListResponse, ApiError, CreateCostCenterPayload>({
    mutationFn: (payload) =>
      apiPost<CreateCostCenterPayload, CostCenterListResponse>(
        "/api/accounting/cost-centers", payload,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.costCenters(variables.companySlug),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — AGING / AR-AP HOOKS
// ═══════════════════════════════════════════════════════════════════════════

interface AgingResponse {
  aging: Array<{ range: string; receivable: number; payable: number; count: number }>;
}

export interface ArApAgingResponse {
  rows: Array<{
    name: string; current: number; thirty: number; sixty: number;
    ninetyPlus: number; total: number;
  }>;
  grandCurrent: number; grandThirty: number; grandSixty: number;
  grandNinetyPlus: number; grandTotal: number;
}

export function useAging(companySlug: string) {
  return useQuery<AgingResponse, ApiError>({
    queryKey: queryKeys.accounting.aging(companySlug),
    queryFn: () =>
      apiGet<AgingResponse>(
        `/api/accounting/aging?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useArApAging(companySlug: string, direction: string) {
  return useQuery<ArApAgingResponse, ApiError>({
    queryKey: [...queryKeys.accounting.aging(companySlug), direction],
    queryFn: () =>
      apiGet<ArApAgingResponse>(
        `/api/accounting/aging?companySlug=${encodeURIComponent(companySlug)}&direction=${direction}`,
      ),
    enabled: !!companySlug && !!direction,
  });
}

export interface ClientStatementResponse {
  clientStatement: {
    clientName: string; openingBalance: number;
    lines: Array<{ date: string; type: string; reference: string; debit: number; credit: number; balance: number }>;
    closingBalance: number;
  };
}

export function useClientStatement(companySlug: string, clientId: number | null) {
  return useQuery<ClientStatementResponse, ApiError>({
    queryKey: [...queryKeys.accounting.clientStatement(companySlug), clientId],
    queryFn: () =>
      apiGet<ClientStatementResponse>(
        `/api/accounting/client-statement?companySlug=${encodeURIComponent(companySlug)}&clientId=${clientId}`,
      ),
    enabled: !!companySlug && !!clientId,
  });
}

export interface SupplierStatementResponse {
  supplierStatement: {
    supplierName: string; openingBalance: number;
    lines: Array<{ date: string; type: string; reference: string; debit: number; credit: number; balance: number }>;
    closingBalance: number;
  };
}

export function useSupplierStatement(companySlug: string, supplierId: number | null) {
  return useQuery<SupplierStatementResponse, ApiError>({
    queryKey: [...queryKeys.accounting.supplierStatement(companySlug), supplierId],
    queryFn: () =>
      apiGet<SupplierStatementResponse>(
        `/api/accounting/supplier-statement?companySlug=${encodeURIComponent(companySlug)}&supplierId=${supplierId}`,
      ),
    enabled: !!companySlug && !!supplierId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — PDC & INSTALLMENT HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export interface PDCListResponse {
  postDatedChecks: Array<{
    id: number; checkNumber: string; bankName: string; amount: number;
    dueDate: string; status: string; direction: string;
    clientName?: string; supplierName?: string;
  }>;
}

export interface CreatePDCPayload {
  checkNumber: string; bankName: string; amount: number;
  dueDate: string; direction: string; clientId?: number;
  supplierId?: number; clientName?: string; supplierName?: string;
  companySlug: string;
}

export function usePostDatedChecks(companySlug: string) {
  return useQuery<PDCListResponse, ApiError>({
    queryKey: queryKeys.accounting.postDatedChecks(companySlug),
    queryFn: () =>
      apiGet<PDCListResponse>(
        `/api/accounting/post-dated-checks?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useCreatePDC() {
  const queryClient = useQueryClient();
  return useMutation<PDCListResponse, ApiError, CreatePDCPayload>({
    mutationFn: (payload) =>
      apiPost<CreatePDCPayload, PDCListResponse>("/api/accounting/post-dated-checks", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.postDatedChecks(variables.companySlug),
      });
    },
  });
}

export function usePDCAction() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: number; action: string; companySlug: string }>({
    mutationFn: ({ id, action, companySlug }) =>
      apiPost<void, void>(
        `/api/accounting/post-dated-checks/${id}/${action}?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.postDatedChecks(variables.companySlug),
      });
    },
  });
}

interface InstallmentListResponse {
  installments: Array<{
    id: number; reference: string; clientName: string;
    totalAmount: number; installmentCount: number; paidCount: number;
    nextDueDate: string; status: string;
  }>;
}

export interface CreateInstallmentPayload {
  reference: string; clientId: number; clientName: string; totalAmount: number;
  installmentCount: number; firstDueDate?: string; companySlug: string;
}

export function useInstallments(companySlug: string) {
  return useQuery<InstallmentListResponse, ApiError>({
    queryKey: queryKeys.accounting.installments(companySlug),
    queryFn: () =>
      apiGet<InstallmentListResponse>(
        `/api/accounting/installments?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useCreateInstallment() {
  const queryClient = useQueryClient();
  return useMutation<InstallmentListResponse, ApiError, CreateInstallmentPayload>({
    mutationFn: (payload) =>
      apiPost<CreateInstallmentPayload, InstallmentListResponse>("/api/accounting/installments", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.installments(variables.companySlug),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — BANK ACCOUNT HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export interface BankAccountListResponse {
  bankAccounts: Array<{
    id: number; name: string; bankName: string; accountName: string;
    accountNumber: string; iban?: string; currency: string;
    accountType?: string; balance: number; glAccountId?: number;
  }>;
}

export interface CreateBankAccountPayload {
  name: string; bankName: string; accountName: string;
  accountNumber: string; iban?: string; currency: string;
  accountType?: string; balance?: number; glAccountId?: number | null;
  companySlug: string;
}

export function useBankAccountsList(companySlug: string) {
  return useQuery<BankAccountListResponse, ApiError>({
    queryKey: queryKeys.accounting.bankAccounts(companySlug),
    queryFn: () =>
      apiGet<BankAccountListResponse>(
        `/api/accounting/bank-accounts?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient();
  return useMutation<BankAccountListResponse, ApiError, CreateBankAccountPayload>({
    mutationFn: (payload) =>
      apiPost<CreateBankAccountPayload, BankAccountListResponse>("/api/accounting/bank-accounts", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.bankAccounts(variables.companySlug),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — BANK RECONCILIATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

interface BankReconciliationResponse {
  items: Array<{
    id: number; date: string; description: string;
    bankAmount: number; bookAmount: number; difference: number; status: string;
  }>;
}

export function useBankReconciliation(companySlug: string, bankAccountId: number | null) {
  return useQuery<BankReconciliationResponse, ApiError>({
    queryKey: [...queryKeys.accounting.bankReconciliation(companySlug), bankAccountId],
    queryFn: () =>
      apiGet<BankReconciliationResponse>(
        `/api/accounting/bank-reconciliation?companySlug=${encodeURIComponent(companySlug)}&bankAccountId=${bankAccountId}`,
      ),
    enabled: !!companySlug && !!bankAccountId,
  });
}

export function useMatchBankReconciliation() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: number; companySlug: string; bankAccountId: number }>({
    mutationFn: ({ id, companySlug, bankAccountId }) =>
      apiPost<void, void>(
        `/api/accounting/bank-reconciliation/${id}/match?companySlug=${encodeURIComponent(companySlug)}&bankAccountId=${bankAccountId}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.accounting.bankReconciliation(variables.companySlug), variables.bankAccountId],
      });
    },
  });
}

export function useCompleteBankReconciliation() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { companySlug: string; bankAccountId: number }>({
    mutationFn: ({ companySlug, bankAccountId }) =>
      apiPost<void, void>(
        `/api/accounting/bank-reconciliation/complete?companySlug=${encodeURIComponent(companySlug)}&bankAccountId=${bankAccountId}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.accounting.bankReconciliation(variables.companySlug), variables.bankAccountId],
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — BANK IMPORT / TRANSFER HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export function useBankImport() {
  const queryClient = useQueryClient();
  return useMutation<Record<string, unknown>, ApiError, FormData>({
    mutationFn: (formData) =>
      apiUpload<Record<string, unknown>>("/api/accounting/bank-import", formData),
    onSuccess: () => {
      void queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "accounting" });
    },
  });
}

interface BankTransferListResponse {
  transfers: Array<{
    id: number; fromAccount: string; toAccount: string;
    amount: number; currency: string; date: string;
    description?: string; status: string; reference: string;
  }>;
}

interface CreateBankTransferPayload {
  fromAccountId: number; toAccountId: number; amount: number;
  currency: string; date: string; description?: string;
  companySlug: string;
}

export function useBankTransfers(companySlug: string) {
  return useQuery<BankTransferListResponse, ApiError>({
    queryKey: queryKeys.accounting.bankTransfers(companySlug),
    queryFn: () =>
      apiGet<BankTransferListResponse>(
        `/api/accounting/bank-transfer?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useCreateBankTransfer() {
  const queryClient = useQueryClient();
  return useMutation<BankTransferListResponse, ApiError, CreateBankTransferPayload>({
    mutationFn: (payload) =>
      apiPost<CreateBankTransferPayload, BankTransferListResponse>("/api/accounting/bank-transfer", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.bankTransfers(variables.companySlug),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.bankAccounts(variables.companySlug),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — FINANCIAL DASHBOARD HOOK
// ═══════════════════════════════════════════════════════════════════════════

interface FinancialDashboardResponse {
  kpis: Array<{ label: string; value: number; change?: number }>;
  monthlyData: Array<{ month: string; revenue: number; expenses: number }>;
}

export function useFinancialDashboard(companySlug: string, from?: string, to?: string) {
  const params = new URLSearchParams({ companySlug });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return useQuery<FinancialDashboardResponse, ApiError>({
    queryKey: [...queryKeys.accounting.financialDashboard(companySlug), { from, to }],
    queryFn: () =>
      apiGet<FinancialDashboardResponse>(`/api/accounting/financial-dashboard?${params.toString()}`),
    enabled: !!companySlug,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — BUDGET HOOKS
// ═══════════════════════════════════════════════════════════════════════════

interface BudgetListResponse {
  budgets: Array<{
    id: number; accountId: number; accountCode: string; accountNameAr: string;
    plannedAmount: number; actualAmount?: number; status: string;
  }>;
}

interface CreateBudgetPayload {
  accountId: number; plannedAmount: number; fiscalYear: number; companySlug: string;
}

export function useBudgets(companySlug: string, fiscalYear?: string) {
  const params = new URLSearchParams({ companySlug });
  if (fiscalYear) params.set("fiscalYear", fiscalYear);
  return useQuery<BudgetListResponse, ApiError>({
    queryKey: [...queryKeys.accounting.budgets(companySlug), { fiscalYear }],
    queryFn: () =>
      apiGet<BudgetListResponse>(`/api/accounting/budgets?${params.toString()}`),
    enabled: !!companySlug,
  });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();
  return useMutation<BudgetListResponse, ApiError, CreateBudgetPayload>({
    mutationFn: (payload) =>
      apiPost<CreateBudgetPayload, BudgetListResponse>("/api/accounting/budgets", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.budgets(variables.companySlug),
      });
    },
  });
}

export function useApproveBudget() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: number; companySlug: string }>({
    mutationFn: ({ id, companySlug }) =>
      apiPost<void, void>(
        `/api/accounting/budgets/${id}/approve?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.budgets(variables.companySlug),
      });
    },
  });
}

export function useReviseBudget() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: number; companySlug: string }>({
    mutationFn: ({ id, companySlug }) =>
      apiPost<void, void>(
        `/api/accounting/budgets/${id}/revise?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.budgets(variables.companySlug),
      });
    },
  });
}

interface BudgetVsActualResponse {
  rows: Array<{
    id: number; accountCode: string; accountNameAr: string;
    planned: number; actual: number; variance: number; variancePercent: number;
  }>;
}

export function useBudgetVsActual(companySlug: string, fiscalYear?: string, periodName?: string) {
  const params = new URLSearchParams({ companySlug });
  if (fiscalYear) params.set("fiscalYear", fiscalYear);
  if (periodName) params.set("periodName", periodName);
  return useQuery<BudgetVsActualResponse, ApiError>({
    queryKey: [...queryKeys.accounting.budgetVsActual(companySlug), { fiscalYear, periodName }],
    queryFn: () =>
      apiGet<BudgetVsActualResponse>(`/api/accounting/budget-vs-actual?${params.toString()}`),
    enabled: !!companySlug,
  });
}

interface PeriodComparisonResponse {
  comparisons: Array<{
    id: number; periodName: string; revenue: number;
    expenses: number; profit: number; cash: number;
  }>;
}

export function usePeriodComparison(companySlug: string, periods?: string) {
  const params = new URLSearchParams({ companySlug });
  if (periods) params.set("periods", periods);
  return useQuery<PeriodComparisonResponse, ApiError>({
    queryKey: [...queryKeys.accounting.periodComparison(companySlug), { periods }],
    queryFn: () =>
      apiGet<PeriodComparisonResponse>(`/api/accounting/period-comparison?${params.toString()}`),
    enabled: !!companySlug,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — FIXED ASSET HOOKS
// ═══════════════════════════════════════════════════════════════════════════

interface FixedAssetListResponse {
  assets: Array<{
    id: number; nameAr: string; nameEn?: string; category: string;
    acquisitionDate: string; acquisitionCost: number; salvageValue: number;
    usefulLifeYears: number; depreciationMethod: string;
    accumulatedDepreciation: number; bookValue: number; status: string;
  }>;
}

interface CreateFixedAssetPayload {
  nameAr: string; nameEn?: string; category: string;
  acquisitionDate: string; acquisitionCost: number; salvageValue: number;
  usefulLifeYears: number; depreciationMethod: string;
  glAccountId?: number; depreciationAccountId?: number; expenseAccountId?: number;
  companySlug: string;
}

export function useFixedAssets(companySlug: string) {
  return useQuery<FixedAssetListResponse, ApiError>({
    queryKey: queryKeys.accounting.fixedAssets(companySlug),
    queryFn: () =>
      apiGet<FixedAssetListResponse>(
        `/api/accounting/fixed-assets?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useCreateFixedAsset() {
  const queryClient = useQueryClient();
  return useMutation<FixedAssetListResponse, ApiError, CreateFixedAssetPayload>({
    mutationFn: (payload) =>
      apiPost<CreateFixedAssetPayload, FixedAssetListResponse>("/api/accounting/fixed-assets", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.fixedAssets(variables.companySlug),
      });
    },
  });
}

interface DepreciationListResponse {
  entries: Array<{
    id: number; assetName: string; period: string;
    depreciationAmount: number; bookValueAfter: number; status: string;
  }>;
}

export function useDepreciation(companySlug: string) {
  return useQuery<DepreciationListResponse, ApiError>({
    queryKey: queryKeys.accounting.depreciation(companySlug),
    queryFn: () =>
      apiGet<DepreciationListResponse>(
        `/api/accounting/depreciation?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useRunDepreciation() {
  const queryClient = useQueryClient();
  return useMutation<DepreciationListResponse, ApiError, { period: string; companySlug: string }>({
    mutationFn: ({ period, companySlug }) =>
      apiPost<{ period: string; companySlug: string }, DepreciationListResponse>(
        `/api/accounting/depreciation?companySlug=${encodeURIComponent(companySlug)}&period=${period}`,
        { period, companySlug },
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.depreciation(variables.companySlug),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.fixedAssets(variables.companySlug),
      });
    },
  });
}

interface AssetDisposalListResponse {
  disposals: Array<{
    id: number; assetName: string; disposalType: string;
    disposalAmount: number; disposalDate: string; status: string;
  }>;
}

export function useAssetDisposals(companySlug: string) {
  return useQuery<AssetDisposalListResponse, ApiError>({
    queryKey: queryKeys.accounting.assetDisposals(companySlug),
    queryFn: () =>
      apiGet<AssetDisposalListResponse>(
        `/api/accounting/asset-disposals?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

interface DisposeAssetPayload {
  id: number; action: "dispose"; disposalType: string;
  disposalAmount: number; disposalDate: string; companySlug: string;
}

export function useDisposeAsset() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, DisposeAssetPayload>({
    mutationFn: ({ id, ...body }) =>
      apiPatch<typeof body, void>(`/api/accounting/fixed-assets/${id}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.fixedAssets(variables.companySlug),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.assetDisposals(variables.companySlug),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — INVENTORY COSTING HOOKS
// ═══════════════════════════════════════════════════════════════════════════

interface InventoryValuationResponse {
  items: Array<{
    id: number; productCode: string; productName: string;
    quantity: number; unitCost: number; totalValue: number; costingMethod: string;
  }>;
}

export function useInventoryValuation(companySlug: string, asOfDate?: string) {
  const params = new URLSearchParams({ companySlug });
  if (asOfDate) params.set("asOfDate", asOfDate);
  return useQuery<InventoryValuationResponse, ApiError>({
    queryKey: [...queryKeys.accounting.inventoryValuation(companySlug), { asOfDate }],
    queryFn: () =>
      apiGet<InventoryValuationResponse>(`/api/accounting/inventory-valuation?${params.toString()}`),
    enabled: !!companySlug,
  });
}

interface COGSResult {
  itemCode: string; itemName: string; quantitySold: number;
  cogsPerUnit: number; totalCOGS: number; method: string;
}

export function useCalculateCOGS() {
  return useMutation<{ result: COGSResult }, ApiError, {
    action: "cogs"; itemId: number; quantitySold: number; companySlug: string;
  }>({
    mutationFn: (payload) =>
      apiPost<typeof payload, { result: COGSResult }>("/api/accounting/inventory-valuation", payload),
  });
}

interface LandedCostResponse {
  items: Array<{
    id: number; purchaseInvoiceId: string; costType: string;
    totalCost: number; allocationMethod: string; status: string; createdAt: string;
  }>;
}

interface CreateLandedCostPayload {
  purchaseInvoiceId: string; costType: string; totalCost: number;
  allocationMethod: string; companySlug: string;
}

export function useLandedCost(companySlug: string) {
  return useQuery<LandedCostResponse, ApiError>({
    queryKey: queryKeys.accounting.landedCost(companySlug),
    queryFn: () =>
      apiGet<LandedCostResponse>(
        `/api/accounting/landed-cost?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useCreateLandedCost() {
  const queryClient = useQueryClient();
  return useMutation<LandedCostResponse, ApiError, CreateLandedCostPayload>({
    mutationFn: (payload) =>
      apiPost<CreateLandedCostPayload, LandedCostResponse>("/api/accounting/landed-cost", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.landedCost(variables.companySlug),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — MULTI-COMPANY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

interface InterCompanyResponse {
  transactions: Array<{
    id: number; date: string; fromCompany: string; toCompany: string;
    amount: number; currency: string; description: string;
    status: string; type: string;
  }>;
}

interface CreateInterCompanyPayload {
  fromCompany: string; toCompany: string; amount: number;
  currency: string; description: string; type: string;
  date: string; companySlug: string;
}

export function useInterCompany(companySlug: string) {
  return useQuery<InterCompanyResponse, ApiError>({
    queryKey: queryKeys.accounting.interCompany(companySlug),
    queryFn: () =>
      apiGet<InterCompanyResponse>(
        `/api/accounting/inter-company?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useCreateInterCompany() {
  const queryClient = useQueryClient();
  return useMutation<InterCompanyResponse, ApiError, CreateInterCompanyPayload>({
    mutationFn: (payload) =>
      apiPost<CreateInterCompanyPayload, InterCompanyResponse>("/api/accounting/inter-company", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.interCompany(variables.companySlug),
      });
    },
  });
}

export function useSettleInterCompany() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: number; companySlug: string }>({
    mutationFn: ({ id, companySlug }) =>
      apiPost<void, void>(
        `/api/accounting/inter-company/${id}/settle?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.interCompany(variables.companySlug),
      });
    },
  });
}

interface ConsolidationResult {
  lines: Array<{
    id: number; accountCode: string; accountName: string; section: string;
    companyA: number; companyB: number; adjustments: number; consolidated: number;
  }>;
  totalAssets: number; totalLiabilities: number;
  totalRevenue: number; totalExpenses: number; netIncome: number;
}

export function useCreateConsolidation() {
  return useMutation<ConsolidationResult, ApiError, {
    companySlugs: string[]; asOfDate: string; companySlug: string;
  }>({
    mutationFn: (payload) =>
      apiPost<typeof payload, ConsolidationResult>("/api/accounting/consolidation", payload),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — PAYMENT RAILS HOOKS
// ═══════════════════════════════════════════════════════════════════════════

interface PaymentMethodListResponse {
  methods: Array<{
    id: number; name: string; nameAr: string; type: string;
    fees: number; currency: string; country: string; available: boolean;
  }>;
}

export function usePaymentMethods(companySlug: string, country?: string, amount?: string) {
  const params = new URLSearchParams({ companySlug });
  if (country) params.set("country", country);
  if (amount) params.set("amount", amount);
  return useQuery<PaymentMethodListResponse, ApiError>({
    queryKey: [...queryKeys.accounting.paymentMethods(companySlug), { country, amount }],
    queryFn: () =>
      apiGet<PaymentMethodListResponse>(`/api/accounting/payment-methods?${params.toString()}`),
    enabled: !!companySlug,
  });
}

interface PaymentResult {
  transactionId: string; checkoutUrl?: string; status: string;
}

interface InitiatePaymentPayload {
  companySlug: string; methodId: number; amount: number;
  currency: string; invoiceId?: number; userId?: string;
}

export function useAccountingInitiatePayment() {
  return useMutation<{ payment: PaymentResult }, ApiError, InitiatePaymentPayload>({
    mutationFn: (payload) =>
      apiPost<InitiatePaymentPayload, { payment: PaymentResult }>("/api/accounting/initiate-payment", payload),
  });
}

interface VerifyPaymentPayload {
  companySlug: string; transactionId: string;
}

export function useVerifyPayment() {
  return useMutation<{ payment: PaymentResult }, ApiError, VerifyPaymentPayload>({
    mutationFn: (payload) =>
      apiPost<VerifyPaymentPayload, { payment: PaymentResult }>("/api/accounting/verify-payment", payload),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — PAYROLL / WPS HOOKS
// ═══════════════════════════════════════════════════════════════════════════

interface PayrollResponse {
  salaries: Array<{
    id: number; employeeName: string; baseSalary: number;
    allowances: number; socialInsurance: number; deductions: number;
    netSalary: number; currency: string; status: string;
  }>;
}

export function usePayroll(companySlug: string, month?: string) {
  const params = new URLSearchParams({ companySlug });
  if (month) params.set("month", month);
  return useQuery<PayrollResponse, ApiError>({
    queryKey: [...queryKeys.accounting.payroll(companySlug), { month }],
    queryFn: () =>
      apiGet<PayrollResponse>(`/api/accounting/payroll?${params.toString()}`),
    enabled: !!companySlug,
  });
}

export function useCalculatePayroll() {
  const queryClient = useQueryClient();
  return useMutation<PayrollResponse, ApiError, { month: string; companySlug: string }>({
    mutationFn: (payload) =>
      apiPost<{ month: string; companySlug: string }, PayrollResponse>("/api/accounting/payroll", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.payroll(variables.companySlug),
      });
    },
  });
}

interface WPSListResponse {
  files: Array<{
    id: number; month: string; country: string; status: string;
    fileUrl?: string; employeeCount: number; totalAmount: number;
    submittedAt?: string; generatedAt?: string;
  }>;
}

export function useWPS(companySlug: string) {
  return useQuery<WPSListResponse, ApiError>({
    queryKey: queryKeys.accounting.wps(companySlug),
    queryFn: () =>
      apiGet<WPSListResponse>(
        `/api/accounting/wps?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useGenerateWPS() {
  const queryClient = useQueryClient();
  return useMutation<WPSListResponse, ApiError, { country: string; month: string; companySlug: string }>({
    mutationFn: (payload) =>
      apiPost<{ country: string; month: string; companySlug: string }, WPSListResponse>("/api/accounting/wps", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.wps(variables.companySlug),
      });
    },
  });
}

export function useSubmitWPS() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: number; companySlug: string }>({
    mutationFn: ({ id, companySlug }) =>
      apiPost<void, void>(
        `/api/accounting/wps/${id}/submit?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.wps(variables.companySlug),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — TAX COMPLIANCE HOOKS
// ═══════════════════════════════════════════════════════════════════════════

interface TaxFilingResponse {
  returns?: Array<{
    id: number; country: string; periodFrom: string; periodTo: string;
    totalSales: number; totalPurchases: number;
    vatOnSales: number; vatOnPurchases: number; vatDue: number; status: string;
  }>;
  records?: Array<{
    id: number; year: string; zakatBase: number; zakatRate: number;
    zakatAmount: number; totalAssets: number; totalLiabilities: number;
    nonZakatAssets: number; breakdown: Record<string, number>; status: string;
  }>;
}

export function useTaxFiling(companySlug: string, type: string) {
  return useQuery<TaxFilingResponse, ApiError>({
    queryKey: [...queryKeys.accounting.taxFiling(companySlug), type],
    queryFn: () =>
      apiGet<TaxFilingResponse>(
        `/api/accounting/tax-filing?companySlug=${encodeURIComponent(companySlug)}&type=${type}`,
      ),
    enabled: !!companySlug && !!type,
  });
}

interface CreateTaxFilingPayload {
  type: string; country?: string; periodFrom?: string; periodTo?: string;
  year?: string; companySlug: string;
}

export function useCreateTaxFiling() {
  const queryClient = useQueryClient();
  return useMutation<Record<string, unknown>, ApiError, CreateTaxFilingPayload>({
    mutationFn: (payload) =>
      apiPost<CreateTaxFilingPayload, Record<string, unknown>>("/api/accounting/tax-filing", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.accounting.taxFiling(variables.companySlug), variables.type],
      });
    },
  });
}

interface FilingRemindersResponse {
  reminders: Array<{
    id: number; title: string; country: string; nextDeadline: string;
    daysUntil: number; type: string; status: string;
  }>;
}

export function useFilingReminders(companySlug: string) {
  return useQuery<FilingRemindersResponse, ApiError>({
    queryKey: queryKeys.accounting.filingReminders(companySlug),
    queryFn: () =>
      apiGet<FilingRemindersResponse>(
        `/api/accounting/filing-reminders?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

interface RetentionCheckResponse {
  checks: Array<{
    id: number; country: string; category: string;
    requiredYears: number; actualYears: number; recordsAtRisk: number; compliant: boolean;
  }>;
}

export function useRetentionCheck(companySlug: string) {
  return useQuery<RetentionCheckResponse, ApiError>({
    queryKey: queryKeys.accounting.retentionCheck(companySlug),
    queryFn: () =>
      apiGet<RetentionCheckResponse>(
        `/api/accounting/retention-check?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — TRADE FINANCE HOOKS
// ═══════════════════════════════════════════════════════════════════════════

interface LetterOfCreditListResponse {
  lettersOfCredit: Array<{
    id: number; lcNumber: string; supplier: string; bank: string;
    amount: number; currency: string; issueDate: string;
    expiryDate: string; status: string;
  }>;
}

interface CreateLetterOfCreditPayload {
  lcNumber: string; supplier: string; bank: string;
  amount: number; currency: string; issueDate?: string;
  expiryDate?: string; status?: string; companySlug: string;
}

export function useLettersOfCredit(companySlug: string) {
  return useQuery<LetterOfCreditListResponse, ApiError>({
    queryKey: queryKeys.accounting.lettersOfCredit(companySlug),
    queryFn: () =>
      apiGet<LetterOfCreditListResponse>(
        `/api/accounting/letters-of-credit?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useCreateLetterOfCredit() {
  const queryClient = useQueryClient();
  return useMutation<LetterOfCreditListResponse, ApiError, CreateLetterOfCreditPayload>({
    mutationFn: (payload) =>
      apiPost<CreateLetterOfCreditPayload, LetterOfCreditListResponse>("/api/accounting/letters-of-credit", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.lettersOfCredit(variables.companySlug),
      });
    },
  });
}

interface FXRevaluationListResponse {
  revaluations: Array<{
    id: number; fromCurrency: string; toCurrency: string; rate: number;
    period: string; realizedGain: number; realizedLoss: number;
    unrealizedGain: number; unrealizedLoss: number; netEffect: number;
  }>;
}

interface CreateFXRevaluationPayload {
  fromCurrency: string; toCurrency: string; rate: number;
  period: string; companySlug: string;
}

export function useFXRevaluation(companySlug: string) {
  return useQuery<FXRevaluationListResponse, ApiError>({
    queryKey: queryKeys.accounting.fxRevaluation(companySlug),
    queryFn: () =>
      apiGet<FXRevaluationListResponse>(
        `/api/accounting/fx-revaluation?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useCreateFXRevaluation() {
  const queryClient = useQueryClient();
  return useMutation<FXRevaluationListResponse, ApiError, CreateFXRevaluationPayload>({
    mutationFn: (payload) =>
      apiPost<CreateFXRevaluationPayload, FXRevaluationListResponse>("/api/accounting/fx-revaluation", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.fxRevaluation(variables.companySlug),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — VOUCHERS / QUOTATIONS / PO HOOKS
// ═══════════════════════════════════════════════════════════════════════════

interface VoucherListResponse {
  vouchers: Array<{
    id: number; voucherType: string; date: string; amount: number;
    currency: string; payee: string; payer: string; status: string;
    amountTextAr?: string;
  }>;
}

interface CreateVoucherPayload {
  voucherType: string; date: string; amount: number;
  currency: string; payee: string; payer: string; companySlug: string;
}

export function useVouchers(companySlug: string) {
  return useQuery<VoucherListResponse, ApiError>({
    queryKey: queryKeys.accounting.vouchers(companySlug),
    queryFn: () =>
      apiGet<VoucherListResponse>(
        `/api/accounting/vouchers?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useCreateVoucher() {
  const queryClient = useQueryClient();
  return useMutation<VoucherListResponse, ApiError, CreateVoucherPayload>({
    mutationFn: (payload) =>
      apiPost<CreateVoucherPayload, VoucherListResponse>("/api/accounting/vouchers", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.vouchers(variables.companySlug),
      });
    },
  });
}

export function useApproveVoucher() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: number; companySlug: string }>({
    mutationFn: ({ id, companySlug }) =>
      apiPost<void, void>(
        `/api/accounting/vouchers/${id}/approve?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.vouchers(variables.companySlug),
      });
    },
  });
}

export function useCancelVoucher() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: number; companySlug: string }>({
    mutationFn: ({ id, companySlug }) =>
      apiPost<void, void>(
        `/api/accounting/vouchers/${id}/cancel?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.vouchers(variables.companySlug),
      });
    },
  });
}

interface QuotationListResponse {
  quotations: Array<{
    id: number; clientName: string; date: string; validUntil: string;
    lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
    totalAmount: number; status: string;
  }>;
}

interface CreateQuotationPayload {
  clientName: string; date: string; validUntil: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  totalAmount: number; companySlug: string;
}

export function useQuotations(companySlug: string) {
  return useQuery<QuotationListResponse, ApiError>({
    queryKey: queryKeys.accounting.quotations(companySlug),
    queryFn: () =>
      apiGet<QuotationListResponse>(
        `/api/accounting/quotations?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useCreateQuotation() {
  const queryClient = useQueryClient();
  return useMutation<QuotationListResponse, ApiError, CreateQuotationPayload>({
    mutationFn: (payload) =>
      apiPost<CreateQuotationPayload, QuotationListResponse>("/api/accounting/quotations", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.quotations(variables.companySlug),
      });
    },
  });
}

export function useConvertQuotationToInvoice() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: number; companySlug: string }>({
    mutationFn: ({ id, companySlug }) =>
      apiPost<void, void>(
        `/api/accounting/quotations/${id}/convert-to-invoice?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "invoices" });
    },
  });
}

interface PurchaseOrderListResponse {
  purchaseOrders: Array<{
    id: number; supplierName: string; date: string; expectedDelivery: string;
    lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
    totalAmount: number; status: string;
  }>;
}

interface CreatePurchaseOrderPayload {
  supplierName: string; date: string; expectedDelivery: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  totalAmount: number; companySlug: string;
}

export function usePurchaseOrders(companySlug: string) {
  return useQuery<PurchaseOrderListResponse, ApiError>({
    queryKey: queryKeys.accounting.purchaseOrders(companySlug),
    queryFn: () =>
      apiGet<PurchaseOrderListResponse>(
        `/api/accounting/purchase-orders?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation<PurchaseOrderListResponse, ApiError, CreatePurchaseOrderPayload>({
    mutationFn: (payload) =>
      apiPost<CreatePurchaseOrderPayload, PurchaseOrderListResponse>("/api/accounting/purchase-orders", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.purchaseOrders(variables.companySlug),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT 2 — OPENING BALANCES / COMMISSIONS / PROFIT DISTRIBUTION
// ═══════════════════════════════════════════════════════════════════════════

interface OpeningBalanceListResponse {
  openingBalances: Array<{
    id: number; accountId: number; accountCode: string;
    accountNameAr: string; amount: number; posted: boolean;
  }>;
}

interface CreateOpeningBalancePayload {
  accountId: number; amount: number; companySlug: string;
}

export function useOpeningBalances(companySlug: string) {
  return useQuery<OpeningBalanceListResponse, ApiError>({
    queryKey: queryKeys.accounting.openingBalances(companySlug),
    queryFn: () =>
      apiGet<OpeningBalanceListResponse>(
        `/api/accounting/opening-balances?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function useCreateOpeningBalance() {
  const queryClient = useQueryClient();
  return useMutation<OpeningBalanceListResponse, ApiError, CreateOpeningBalancePayload>({
    mutationFn: (payload) =>
      apiPost<CreateOpeningBalancePayload, OpeningBalanceListResponse>("/api/accounting/opening-balances", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.openingBalances(variables.companySlug),
      });
    },
  });
}

export function usePostOpeningBalances() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { companySlug: string }>({
    mutationFn: ({ companySlug }) =>
      apiPost<void, void>(
        `/api/accounting/opening-balances/post?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.openingBalances(variables.companySlug),
      });
    },
  });
}

interface CommissionListResponse {
  commissions: Array<{
    id: number; salesperson: string; totalSales: number;
    commissionAmount: number; posted: boolean;
  }>;
}

export function useAccountingCommissions(companySlug: string, from?: string, to?: string) {
  const params = new URLSearchParams({ companySlug });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return useQuery<CommissionListResponse, ApiError>({
    queryKey: [...queryKeys.accounting.commissions(companySlug), { from, to }],
    queryFn: () =>
      apiGet<CommissionListResponse>(`/api/accounting/commissions?${params.toString()}`),
    enabled: !!companySlug,
  });
}

export function usePostCommission() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: number; companySlug: string }>({
    mutationFn: ({ id, companySlug }) =>
      apiPost<void, void>(
        `/api/accounting/commissions/${id}/post-as-journal-entry?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.commissions(variables.companySlug),
      });
    },
  });
}

interface ProfitDistributionListResponse {
  distributions: Array<{
    id: number; partnerName: string; ownershipPercent: number;
    profitShare: number; posted: boolean;
  }>;
}

export function useProfitDistribution(companySlug: string) {
  return useQuery<ProfitDistributionListResponse, ApiError>({
    queryKey: queryKeys.accounting.profitDistribution(companySlug),
    queryFn: () =>
      apiGet<ProfitDistributionListResponse>(
        `/api/accounting/profit-distribution?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

export function usePostProfitDistribution() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: number; companySlug: string }>({
    mutationFn: ({ id, companySlug }) =>
      apiPost<void, void>(
        `/api/accounting/profit-distribution/${id}/post-as-journal-entry?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.profitDistribution(variables.companySlug),
      });
    },
  });
}

// ─── Accountant Access Hooks ────────────────────────────────────────────────

/** Shape of an accountant access record returned by the API. */
export interface AccountantAccess {
  id: number;
  accountantName: string;
  accountantEmail: string;
  accessLevel: string;
  status: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Response shape for the accountant access list endpoint. */
interface AccountantAccessListResponse {
  accesses: AccountantAccess[];
}

/** Payload for granting accountant access. */
export interface CreateAccountantAccessPayload {
  companySlug: string;
  accountantName: string;
  accountantEmail: string;
  accessLevel: string;
  [key: string]: unknown;
}

/**
 * Fetch a list of accountant access entries for a given company.
 *
 * @param companySlug - Slug of the company whose accountant access entries to fetch.
 */
export function useAccountantAccess(companySlug: string) {
  return useQuery<AccountantAccessListResponse, ApiError>({
    queryKey: queryKeys.accounting.accountantAccess(companySlug),
    queryFn: () =>
      apiGet<AccountantAccessListResponse>(
        `/api/accounting/accountant-access?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Grant accountant access to a new accountant.
 *
 * On success the accountant access list queries are invalidated so
 * every mounted list view refetches with the new entry.
 */
export function useCreateAccountantAccess() {
  const queryClient = useQueryClient();

  return useMutation<AccountantAccess, ApiError, CreateAccountantAccessPayload>({
    mutationFn: (payload) =>
      apiPost<CreateAccountantAccessPayload, AccountantAccess>(
        "/api/accounting/accountant-access",
        payload,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.accountantAccess(variables.companySlug),
      });
    },
  });
}

/**
 * Revoke accountant access by ID.
 *
 * On success the accountant access list queries are invalidated so
 * every mounted list view refetches without the revoked entry.
 */
export function useRevokeAccountantAccess() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, { id: number; companySlug: string }>({
    mutationFn: ({ id, companySlug }) =>
      apiPost<void, void>(
        `/api/accounting/accountant-access/${id}/revoke?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.accounting.accountantAccess(variables.companySlug),
      });
    },
  });
}

// ─── Accounting Audit Hooks ─────────────────────────────────────────────────

/** Shape of an accounting audit entry returned by the API. */
export interface AccountingAuditEntry {
  id: number;
  action: string;
  actor: string;
  target: string;
  timestamp: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Response shape for the accounting audit list endpoint. */
interface AccountingAuditListResponse {
  entries: AccountingAuditEntry[];
}

/**
 * Fetch accounting audit entries for a given company.
 *
 * @param companySlug - Slug of the company whose accounting audit entries to fetch.
 */
export function useAccountingAudit(companySlug: string) {
  return useQuery<AccountingAuditListResponse, ApiError>({
    queryKey: queryKeys.accounting.accountingAudit(companySlug),
    queryFn: () =>
      apiGet<AccountingAuditListResponse>(
        `/api/accounting/accounting-audit?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

// ─── Export Excel Hook ──────────────────────────────────────────────────────

/**
 * Download an Excel export of accounting data.
 *
 * Returns a Blob that the caller can convert to a download link.
 * This is a fire-and-forget style mutation — it does not invalidate
 * any query caches automatically since it produces a file download,
 * not a data change.
 *
 * @param variables - Object containing companySlug, export type, and period.
 */
export function useExportExcel() {
  return useMutation<Blob, ApiError, { companySlug: string; type: string; period: string }>({
    mutationFn: ({ companySlug, type, period }) =>
      apiDownloadBlob(
        `/api/accounting/export-excel?companySlug=${encodeURIComponent(companySlug)}&type=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}`,
      ),
  });
}

// ─── WPS Download Hook ──────────────────────────────────────────────────────

/**
 * Download a WPS file by its ID.
 *
 * Returns a Blob that the caller can convert to a download link.
 * This is a fire-and-forget style mutation — it does not invalidate
 * any query caches automatically since it produces a file download,
 * not a data change.
 *
 * @param variables - Object containing fileId and companySlug.
 */
export function useDownloadWPSFile() {
  return useMutation<Blob, ApiError, { fileId: number; companySlug: string }>({
    mutationFn: ({ fileId, companySlug }) =>
      apiDownloadBlob(
        `/api/accounting/wps/${fileId}/download?companySlug=${encodeURIComponent(companySlug)}`,
      ),
  });
}
