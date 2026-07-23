/**
 * settings.ts — React Query hooks for company settings and invoice templates.
 *
 * Provides typed query and mutation hooks for reading and updating company
 * settings as well as full CRUD for invoice templates. All hooks use the
 * centralized `queryKeys` factory for granular cache invalidation and the
 * typed `apiGet`/`apiPost`/`apiPatch`/`apiDelete` helpers for consistent
 * requests.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Shape of the company settings record returned by the API. */
export interface CompanyInfo {
  slug: string;
  name: string;
  nameAr?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxNumber?: string;
  crNumber?: string;
  logo?: string;
  currency?: string;
  timezone?: string;
  workingHours?: Record<string, string>;
  aiModel?: string;
  [key: string]: unknown;
}

/** Shape of an invoice template row returned by the API. */
export interface InvoiceTemplateRow {
  id: number;
  companySlug: string;
  name: string;
  isDefault: boolean;
  layoutType: string;
  primaryColor: string;
  fontFamily: string;
  logoPosition: string;
  showTaxNumber: boolean;
  showQrCode: boolean;
  showBankDetails: boolean;
  footerText?: string | null;
  termsAndConditions?: string | null;
  paperSize: string;
  createdAt: string;
}

/** Payload for updating company settings. */
export interface UpdateSettingsPayload {
  slug: string;
  name?: string;
  nameAr?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxNumber?: string;
  crNumber?: string;
  logo?: string;
  currency?: string;
  timezone?: string;
  workingHours?: Record<string, string>;
  aiModel?: string;
  [key: string]: unknown;
}

/** Payload for creating a new invoice template. */
export interface CreateInvoiceTemplatePayload {
  companySlug: string;
  name: string;
  isDefault?: boolean;
  layoutType?: string;
  primaryColor?: string;
  fontFamily?: string;
  logoPosition?: string;
  showTaxNumber?: boolean;
  showQrCode?: boolean;
  showBankDetails?: boolean;
  footerText?: string | null;
  termsAndConditions?: string | null;
  paperSize?: string;
}

/** Payload for updating an existing invoice template. */
export interface UpdateInvoiceTemplatePayload {
  id: number;
  name?: string;
  isDefault?: boolean;
  layoutType?: string;
  primaryColor?: string;
  fontFamily?: string;
  logoPosition?: string;
  showTaxNumber?: boolean;
  showQrCode?: boolean;
  showBankDetails?: boolean;
  footerText?: string | null;
  termsAndConditions?: string | null;
  paperSize?: string;
}

/** Response shape for the company settings endpoint. */
interface SettingsResponse {
  settings: CompanyInfo;
}

/** Response shape for the invoice template list endpoint. */
interface InvoiceTemplateListResponse {
  templates: InvoiceTemplateRow[];
  templateSettings?: Record<string, unknown>;
}

/** Response shape for a single invoice template endpoint. */
interface InvoiceTemplateResponse {
  template: InvoiceTemplateRow;
}

// ─── Settings Query Hooks ───────────────────────────────────────────────────

/**
 * Fetch the settings for a given company.
 *
 * The query is disabled when `slug` is empty, preventing unnecessary
 * requests before the active company is known.
 *
 * @param slug - Slug of the company whose settings to fetch.
 */
export function useSettings(slug: string) {
  return useQuery<SettingsResponse, ApiError>({
    queryKey: queryKeys.settings.company(slug),
    queryFn: () =>
      apiGet<SettingsResponse>(`/api/settings?companySlug=${encodeURIComponent(slug)}`),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000, // 5 minutes — settings rarely change
  });
}

// ─── Settings Mutation Hooks ────────────────────────────────────────────────

/**
 * Update the settings for a given company.
 *
 * On success the company settings cache for the target slug is
 * invalidated so the UI reflects the new configuration.
 *
 * @param variables - Object containing the company `slug` and the fields to update.
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation<SettingsResponse, ApiError, UpdateSettingsPayload>({
    mutationFn: (payload) => {
      const { slug, ...body } = payload;
      return apiPatch<typeof body, SettingsResponse>(
        `/api/settings?companySlug=${encodeURIComponent(slug)}`,
        body,
      );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.settings.company(variables.slug),
      });
    },
  });
}

// ─── Invoice Template Query Hooks ───────────────────────────────────────────

/**
 * Fetch the list of invoice templates for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose invoice templates to fetch.
 */
export function useInvoiceTemplates(companySlug: string) {
  return useQuery<InvoiceTemplateListResponse, ApiError>({
    queryKey: queryKeys.invoiceTemplates.list(companySlug),
    queryFn: () =>
      apiGet<InvoiceTemplateListResponse>(
        `/api/invoice-templates?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
    staleTime: 5 * 60 * 1000, // 5 minutes — templates rarely change
  });
}

// ─── Invoice Template Mutation Hooks ────────────────────────────────────────

/**
 * Create a new invoice template.
 *
 * On success all invoice template list queries are invalidated so every
 * mounted list view refetches with the new entry.
 */
export function useCreateInvoiceTemplate() {
  const queryClient = useQueryClient();

  return useMutation<InvoiceTemplateResponse, ApiError, CreateInvoiceTemplatePayload>({
    mutationFn: (payload) =>
      apiPost<CreateInvoiceTemplatePayload, InvoiceTemplateResponse>(
        "/api/invoice-templates",
        payload,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.invoiceTemplates.lists(),
      });
    },
  });
}

/**
 * Update an existing invoice template.
 *
 * On success all invoice template list queries are invalidated so every
 * mounted list view refetches with the updated data.
 *
 * @param variables - Object containing the template `id` and the fields to update.
 */
export function useUpdateInvoiceTemplate() {
  const queryClient = useQueryClient();

  return useMutation<InvoiceTemplateResponse, ApiError, UpdateInvoiceTemplatePayload>({
    mutationFn: (payload) => {
      const { id, ...body } = payload;
      return apiPatch<typeof body, InvoiceTemplateResponse>(
        `/api/invoice-templates/${id}`,
        body,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.invoiceTemplates.lists(),
      });
    },
  });
}

/**
 * Delete an invoice template by ID.
 *
 * On success all invoice template list queries are invalidated so every
 * mounted list view refetches without the deleted entry.
 *
 * @param variables - The ID of the template to delete.
 */
export function useDeleteInvoiceTemplate() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, number>({
    mutationFn: (id) => apiDelete<void>(`/api/invoice-templates/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.invoiceTemplates.lists(),
      });
    },
  });
}
