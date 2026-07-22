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
import { apiGet, apiPost, apiDelete, ApiError } from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Shape of an account record returned by the API. */
export interface Account {
  id: number;
  code: string;
  name: string;
  type: string;
  balance: number;
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
export function useProfitLoss(companySlug: string) {
  return useQuery<ProfitLossResponse, ApiError>({
    queryKey: queryKeys.accounting.profitLoss(companySlug),
    queryFn: () =>
      apiGet<ProfitLossResponse>(
        `/api/accounting/profit-loss?companySlug=${encodeURIComponent(companySlug)}`,
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
export function useBalanceSheet(companySlug: string) {
  return useQuery<BalanceSheetResponse, ApiError>({
    queryKey: queryKeys.accounting.balanceSheet(companySlug),
    queryFn: () =>
      apiGet<BalanceSheetResponse>(
        `/api/accounting/balance-sheet?companySlug=${encodeURIComponent(companySlug)}`,
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
export function useCashFlow(companySlug: string) {
  return useQuery<CashFlowResponse, ApiError>({
    queryKey: queryKeys.accounting.cashFlow(companySlug),
    queryFn: () =>
      apiGet<CashFlowResponse>(
        `/api/accounting/cash-flow?companySlug=${encodeURIComponent(companySlug)}`,
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
