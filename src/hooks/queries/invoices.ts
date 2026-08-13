/**
 * invoices.ts — React Query hooks for invoice CRUD and status operations.
 *
 * Provides typed query and mutation hooks for listing, fetching, creating,
 * updating, deleting, status changes, and payment recording for invoices.
 * All hooks use the centralized `queryKeys` factory for granular cache
 * invalidation and the typed `apiGet`/`apiPost`/`apiPatch`/`apiDelete`
 * helpers for consistent requests.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";

// P0-15 (Engineering Audit): Re-export the canonical Invoice + LineItem
// types from src/modules/invoices/types.ts so there is exactly one
// Invoice shape across the codebase. Previously this file declared a
// divergent Invoice interface with different fields (items? vs lineItems,
// no version, no outstanding, no taxRate/shipping/discount, clientId
// typed as number instead of string|null).
//
// For backward compatibility with existing imports from this module,
// we keep the InvoiceItem alias (it has the same shape as LineItem plus
// an optional `id`).
import type { Invoice, LineItem } from "@/modules/invoices/types";
export type { Invoice, LineItem };

/** Legacy alias for LineItem — kept for backward compat with imports
 *  that used `InvoiceItem` from this module. */
export interface InvoiceItem extends LineItem {
  id?: number;
}

/** Payload for creating a new invoice. */
export interface CreateInvoicePayload {
  invoiceNumber: string;
  /** Prisma `String?` — nullable FK to clients.id (cuid). */
  clientId?: string | number;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  issueDate: string;
  dueDate: string;
  status?: string;
  subtotal?: number;
  taxAmount?: number;
  total?: number;
  companySlug: string;
  /** Legacy alias — the API accepts both `items` and `lineItems`. */
  items?: Omit<InvoiceItem, "id">[];
  lineItems?: Omit<InvoiceItem, "id">[];
  taxRate?: number;
  shipping?: number;
  discount?: number;
  notes?: string;
  expectedVersion?: number;
  [key: string]: any;
}

/** Payload for updating an existing invoice. */
export interface UpdateInvoicePayload {
  id: number;
  invoiceNumber?: string;
  clientId?: number;
  issueDate?: string;
  dueDate?: string;
  status?: string;
  subtotal?: number;
  taxAmount?: number;
  total?: number;
  items?: Omit<InvoiceItem, "id">[];
  [key: string]: any;
}

/** Payload for updating the status of an invoice. */
export interface UpdateInvoiceStatusPayload {
  id: number;
  status: string;
}

/** Payload for recording a payment against an invoice. */
export interface RecordPaymentPayload {
  id: number;
  amount: number;
  date: string;
  method?: string;
  reference?: string;
  notes?: string;
  [key: string]: any;
}

/** Response shape for the invoice list endpoint. */
interface InvoiceListResponse {
  invoices: Invoice[];
}

/** Response shape for a single invoice endpoint. */
interface InvoiceResponse {
  invoice: Invoice;
  /** Review-queue warnings returned when creating a new invoice. */
  reviewQueueWarnings?: string[];
  /** Inventory oversell warnings returned when creating a new invoice. */
  warnings?: string[];
}

// ─── Query Hooks ────────────────────────────────────────────────────────────

/**
 * Fetch a filtered list of invoices for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose invoices to fetch.
 * @param search      - Optional search string to filter results.
 */
export function useInvoices(companySlug: string, search?: string) {
  return useQuery<InvoiceListResponse, ApiError>({
    queryKey: queryKeys.invoices.list({ companySlug, search }),
    queryFn: () => {
      const params = new URLSearchParams({ companySlug });
      if (search) {
        params.set("search", search);
      }
      return apiGet<InvoiceListResponse>(`/api/invoices?${params.toString()}`);
    },
    enabled: !!companySlug,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Fetch a single invoice by ID.
 *
 * The query is disabled when `id` is not a positive number.
 *
 * @param id - Primary key of the invoice to fetch.
 */
export function useInvoice(id: number) {
  return useQuery<InvoiceResponse, ApiError>({
    queryKey: queryKeys.invoices.detail(id),
    queryFn: () => apiGet<InvoiceResponse>(`/api/invoices/${id}`),
    enabled: id > 0,
  });
}

// ─── Mutation Hooks ─────────────────────────────────────────────────────────

/**
 * Create a new invoice.
 *
 * On success all invoice list queries are invalidated so every mounted
 * list view refetches with the new entry.
 */
export function useCreateInvoice() {
  const queryClient = useQueryClient();

  return useMutation<InvoiceResponse, ApiError, CreateInvoicePayload>({
    mutationFn: (payload) =>
      apiPost<CreateInvoicePayload, InvoiceResponse>("/api/invoices", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.lists() });
    },
  });
}

/**
 * Update an existing invoice.
 *
 * On success both the list queries **and** the specific detail query for the
 * updated invoice are invalidated, ensuring all views reflect the new data.
 */
export function useUpdateInvoice() {
  const queryClient = useQueryClient();

  return useMutation<InvoiceResponse, ApiError, UpdateInvoicePayload>({
    mutationFn: (payload) => {
      const { id, ...body } = payload;
      return apiPatch<typeof body, InvoiceResponse>(`/api/invoices/${id}`, body);
    },
    onSuccess: (_data, variables) => {
      // Invalidate all list queries (any company / search filter)
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.lists() });
      // Invalidate the specific detail cache for this invoice
      void queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.detail(variables.id),
      });
    },
  });
}

/**
 * Delete a single invoice.
 *
 * On success all invoice list queries are invalidated. The detail cache
 * for the deleted invoice is also removed to prevent stale data from
 * appearing if the user navigates back.
 */
export function useDeleteInvoice() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, number>({
    mutationFn: (id) => apiDelete<void>(`/api/invoices/${id}`),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.lists() });
      // Remove detail cache for the deleted invoice
      void queryClient.removeQueries({ queryKey: queryKeys.invoices.detail(id) });
    },
  });
}

/**
 * Update the status of an invoice (e.g. draft → sent → paid).
 *
 * On success both the detail query for the target invoice and all list
 * queries are invalidated, ensuring the status change is reflected
 * everywhere.
 *
 * @param variables - Object containing the invoice `id` and the new `status`.
 */
export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient();

  return useMutation<InvoiceResponse, ApiError, UpdateInvoiceStatusPayload>({
    mutationFn: (variables) => {
      const { id, status } = variables;
      return apiPatch<{ status: string }, InvoiceResponse>(
        `/api/invoices/${id}/status`,
        { status },
      );
    },
    onSuccess: (_data, variables) => {
      // Invalidate the specific detail cache for this invoice
      void queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.detail(variables.id),
      });
      // Invalidate all list queries so status filters update
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.lists() });
    },
  });
}

/**
 * Record a payment against an invoice.
 *
 * On success both the detail query for the target invoice and all list
 * queries are invalidated, ensuring the paid amount and status are
 * reflected everywhere.
 *
 * @param variables - Object containing the invoice `id` and payment details.
 */
export function useRecordPayment() {
  const queryClient = useQueryClient();

  return useMutation<InvoiceResponse, ApiError, RecordPaymentPayload>({
    mutationFn: (variables) => {
      const { id, ...paymentData } = variables;
      return apiPatch<typeof paymentData, InvoiceResponse>(
        `/api/invoices/${id}/payment`,
        paymentData,
      );
    },
    onSuccess: (_data, variables) => {
      // Invalidate the specific detail cache for this invoice
      void queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.detail(variables.id),
      });
      // Invalidate all list queries so totals and statuses update
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.lists() });
    },
  });
}
