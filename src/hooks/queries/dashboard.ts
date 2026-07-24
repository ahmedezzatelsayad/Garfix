/**
 * dashboard.ts — React Query hooks for dashboard, companies, notifications,
 * audit, backups, purchases, reports, feature flags, and modules.
 *
 * Provides typed query and mutation hooks for the main dashboard view and
 * supporting data. All hooks use the centralized `queryKeys` factory for
 * granular cache invalidation and the typed `apiGet`/`apiPost`/`apiPatch`/
 * `apiDelete` helpers for consistent requests.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Shape of the dashboard statistics returned by the API. */
export interface DashboardStats {
  totalRevenue: number;
  outstanding: number;
  totalClients: number;
  totalInvoices: number;
  paidCount: number;
  overdueCount: number;
  [key: string]: unknown;
}

/** Shape of a notification record returned by the API. */
export interface Notification {
  id: number;
  title: string;
  message: string;
  read: boolean;
  companySlug: string;
  [key: string]: unknown;
}

/** Shape of an audit log entry returned by the API. */
export interface AuditLogEntry {
  id: number;
  action: string;
  actor: string;
  target: string;
  timestamp: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Shape of a backup record returned by the API. */
export interface Backup {
  id: number;
  filename: string;
  size: number;
  createdAt: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Shape of a company record returned by the API. */
export interface Company {
  slug: string;
  name: string;
  [key: string]: unknown;
}

/** Shape of a company member record returned by the API. */
export interface CompanyMember {
  uid: string;
  name: string;
  email: string;
  role: string;
  [key: string]: unknown;
}

/** Shape of a purchase record returned by the API. */
export interface Purchase {
  id: number;
  description: string;
  amount: number;
  date: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Shape of a report record returned by the API. */
export interface Report {
  id: number;
  title: string;
  type: string;
  createdAt: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Shape of a feature flag returned by the API. */
export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description?: string;
  [key: string]: unknown;
}

/** Shape of a module record returned by the API. */
export interface Module {
  id: string;
  name: string;
  enabled: boolean;
  [key: string]: unknown;
}

/** Payload for creating a new company. */
export interface CreateCompanyPayload {
  name: string;
  slug: string;
  [key: string]: unknown;
}

/** Payload for updating an existing company. */
export interface UpdateCompanyPayload {
  slug: string;
  name?: string;
  [key: string]: unknown;
}

/** Payload for adding a member to a company. */
export interface AddCompanyMemberPayload {
  slug: string;
  uid: string;
  role: string;
  [key: string]: unknown;
}

/** Payload for updating a company member's role. */
export interface UpdateCompanyMemberPayload {
  slug: string;
  uid: string;
  role: string;
  [key: string]: unknown;
}

/** Payload for removing a company member. */
export interface RemoveCompanyMemberPayload {
  slug: string;
  uid: string;
}

/** Payload for creating a new purchase. */
export interface CreatePurchasePayload {
  description: string;
  amount: number;
  date: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Payload for updating an existing purchase. */
export interface UpdatePurchasePayload {
  id: number;
  description?: string;
  amount?: number;
  date?: string;
  [key: string]: unknown;
}

/** Response shape for the dashboard stats endpoint. */
interface DashboardStatsResponse {
  stats: DashboardStats;
}

/** Response shape for the notifications list endpoint. */
interface NotificationListResponse {
  notifications: Notification[];
}

/** Response shape for the audit log list endpoint. */
interface AuditLogListResponse {
  logs: AuditLogEntry[];
}

/** Response shape for the backups list endpoint. */
interface BackupListResponse {
  backups: Backup[];
}

/** Response shape for the companies list endpoint. */
interface CompanyListResponse {
  companies: Company[];
}

/** Response shape for a single company endpoint. */
interface CompanyDetailResponse {
  company: Company;
}

/** Response shape for the company members endpoint. */
interface CompanyMemberListResponse {
  members: CompanyMember[];
}

/** Response shape for the purchases list endpoint. */
interface PurchaseListResponse {
  purchases: Purchase[];
}

/** Response shape for the reports list endpoint. */
interface ReportListResponse {
  reports: Report[];
}

/** Response shape for the feature flags endpoint. */
interface FeatureFlagListResponse {
  flags: FeatureFlag[];
}

/** Response shape for the modules endpoint. */
interface ModuleListResponse {
  modules: Module[];
}

// ─── Dashboard Query Hooks ──────────────────────────────────────────────────

/**
 * Fetch dashboard statistics for a given company.
 *
 * Uses a 1-minute stale time since dashboard stats are relatively
 * stable but should still refresh periodically. The query is disabled
 * when `companySlug` is empty.
 *
 * @param companySlug - Slug of the company whose dashboard stats to fetch.
 */
export function useDashboardStats(companySlug: string) {
  return useQuery<DashboardStatsResponse, ApiError>({
    queryKey: queryKeys.dashboard.stats(companySlug),
    queryFn: () =>
      apiGet<DashboardStatsResponse>(
        `/api/dashboard/stats?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
    staleTime: 60_000,
  });
}

// ─── Notification Hooks ─────────────────────────────────────────────────────

/**
 * Fetch notifications for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose notifications to fetch.
 */
export function useNotifications(companySlug: string) {
  return useQuery<NotificationListResponse, ApiError>({
    queryKey: queryKeys.notifications.list(companySlug),
    queryFn: () =>
      apiGet<NotificationListResponse>(
        `/api/notifications?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Create a new notification.
 *
 * On success all notification queries are invalidated so every mounted
 * list view refetches with the new entry.
 */
export function useCreateNotification() {
  const queryClient = useQueryClient();

  return useMutation<Notification, ApiError, Partial<Notification>>({
    mutationFn: (payload) =>
      apiPost<Partial<Notification>, Notification>("/api/notifications", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.all,
      });
    },
  });
}

// ─── Audit Log Hooks ────────────────────────────────────────────────────────

/**
 * Fetch audit log entries for a given company.
 *
 * @param companySlug - Slug of the company whose audit log to fetch.
 */
export function useAuditLog(companySlug: string) {
  return useQuery<AuditLogListResponse, ApiError>({
    queryKey: queryKeys.audit.list(companySlug),
    queryFn: () =>
      apiGet<AuditLogListResponse>(
        `/api/audit?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

// ─── Backup Hooks ───────────────────────────────────────────────────────────

/**
 * Fetch backups for a given company.
 *
 * @param companySlug - Slug of the company whose backups to fetch.
 */
export function useBackups(companySlug: string) {
  return useQuery<BackupListResponse, ApiError>({
    queryKey: queryKeys.backups.list(companySlug),
    queryFn: () =>
      apiGet<BackupListResponse>(
        `/api/backups?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Create a new backup.
 *
 * On success all backup queries are invalidated so every mounted
 * list view refetches with the new entry.
 */
export function useCreateBackup() {
  const queryClient = useQueryClient();

  return useMutation<Backup, ApiError, { companySlug: string }>({
    mutationFn: (payload) =>
      apiPost<{ companySlug: string }, Backup>("/api/backups", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.backups.all,
      });
    },
  });
}

// ─── Company Hooks ──────────────────────────────────────────────────────────

/**
 * Fetch the list of all companies the user has access to.
 */
export function useCompanies() {
  return useQuery<CompanyListResponse, ApiError>({
    queryKey: queryKeys.companies.lists(),
    queryFn: () => apiGet<CompanyListResponse>("/api/companies"),
  });
}

/**
 * Fetch a single company by slug.
 *
 * The query is disabled when `slug` is empty, preventing
 * unnecessary requests.
 *
 * @param slug - Slug of the company to fetch.
 */
export function useCompany(slug: string) {
  return useQuery<CompanyDetailResponse, ApiError>({
    queryKey: queryKeys.companies.detail(slug),
    queryFn: () => apiGet<CompanyDetailResponse>(`/api/companies/${slug}`),
    enabled: !!slug,
  });
}

/**
 * Fetch members of a specific company.
 *
 * The query is disabled when `slug` is empty, preventing
 * unnecessary requests.
 *
 * @param slug - Slug of the company whose members to fetch.
 */
export function useCompanyMembers(slug: string) {
  return useQuery<CompanyMemberListResponse, ApiError>({
    queryKey: queryKeys.companies.members(slug),
    queryFn: () =>
      apiGet<CompanyMemberListResponse>(`/api/companies/${slug}/members`),
    enabled: !!slug,
  });
}

/**
 * Create a new company.
 *
 * On success all company list queries are invalidated so every mounted
 * list view refetches with the new entry.
 */
export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation<Company, ApiError, CreateCompanyPayload>({
    mutationFn: (payload) =>
      apiPost<CreateCompanyPayload, Company>("/api/companies", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.companies.lists(),
      });
    },
  });
}

/**
 * Update an existing company.
 *
 * On success both the specific detail query and all list queries
 * are invalidated, ensuring all views reflect the updated data.
 */
export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation<Company, ApiError, UpdateCompanyPayload>({
    mutationFn: (payload) => {
      const { slug, ...body } = payload;
      return apiPatch<typeof body, Company>(`/api/companies/${slug}`, body);
    },
    onSuccess: (_data, variables) => {
      // Invalidate the specific detail cache for this company
      void queryClient.invalidateQueries({
        queryKey: queryKeys.companies.detail(variables.slug),
      });
      // Invalidate all company list queries
      void queryClient.invalidateQueries({
        queryKey: queryKeys.companies.lists(),
      });
    },
  });
}

/**
 * Add a member to a company.
 *
 * On success the members query for the target company is invalidated,
 * ensuring the updated member list is reflected.
 */
export function useAddCompanyMember() {
  const queryClient = useQueryClient();

  return useMutation<CompanyMember, ApiError, AddCompanyMemberPayload>({
    mutationFn: (payload) => {
      const { slug, ...body } = payload;
      return apiPost<typeof body, CompanyMember>(
        `/api/companies/${slug}/members`,
        body,
      );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.companies.members(variables.slug),
      });
    },
  });
}

/**
 * Update a company member's role.
 *
 * On success the members query for the target company is invalidated,
 * ensuring the updated role is reflected.
 */
export function useUpdateCompanyMember() {
  const queryClient = useQueryClient();

  return useMutation<CompanyMember, ApiError, UpdateCompanyMemberPayload>({
    mutationFn: (payload) => {
      const { slug, uid, ...body } = payload;
      return apiPatch<typeof body, CompanyMember>(
        `/api/companies/${slug}/members/${uid}`,
        body,
      );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.companies.members(variables.slug),
      });
    },
  });
}

/**
 * Remove a member from a company.
 *
 * On success the members query for the target company is invalidated,
 * ensuring the removed member no longer appears in the list.
 */
export function useRemoveCompanyMember() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, RemoveCompanyMemberPayload>({
    mutationFn: ({ slug, uid }) =>
      apiDelete<void>(`/api/companies/${slug}/members/${uid}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.companies.members(variables.slug),
      });
    },
  });
}

// ─── Purchase Hooks ─────────────────────────────────────────────────────────

/**
 * Fetch purchases for a given company.
 *
 * @param companySlug - Slug of the company whose purchases to fetch.
 */
export function usePurchases(companySlug: string) {
  return useQuery<PurchaseListResponse, ApiError>({
    queryKey: queryKeys.purchases.list(companySlug),
    queryFn: () =>
      apiGet<PurchaseListResponse>(
        `/api/purchases?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Create a new purchase.
 *
 * On success all purchase queries are invalidated so every mounted
 * list view refetches with the new entry.
 */
export function useCreatePurchase() {
  const queryClient = useQueryClient();

  return useMutation<Purchase, ApiError, CreatePurchasePayload>({
    mutationFn: (payload) =>
      apiPost<CreatePurchasePayload, Purchase>("/api/purchases", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.purchases.all,
      });
    },
  });
}

/**
 * Update an existing purchase.
 *
 * On success all purchase queries are invalidated, ensuring all views
 * reflect the updated data.
 */
export function useUpdatePurchase() {
  const queryClient = useQueryClient();

  return useMutation<Purchase, ApiError, UpdatePurchasePayload>({
    mutationFn: (payload) => {
      const { id, ...body } = payload;
      return apiPatch<typeof body, Purchase>(`/api/purchases/${id}`, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.purchases.all,
      });
    },
  });
}

/**
 * Delete a purchase by ID.
 *
 * On success all purchase queries are invalidated so every mounted
 * list view refetches without the deleted entry.
 */
export function useDeletePurchase() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, number>({
    mutationFn: (id) => apiDelete<void>(`/api/purchases/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.purchases.all,
      });
    },
  });
}

// ─── Report Hooks ───────────────────────────────────────────────────────────

/**
 * Fetch reports for a given company.
 *
 * @param companySlug - Slug of the company whose reports to fetch.
 */
export function useReports(companySlug: string) {
  return useQuery<ReportListResponse, ApiError>({
    queryKey: queryKeys.reports.list(companySlug),
    queryFn: () =>
      apiGet<ReportListResponse>(
        `/api/reports?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

// ─── Feature Flag Hooks ─────────────────────────────────────────────────────

/**
 * Fetch the list of feature flags.
 */
export function useFeatureFlags() {
  return useQuery<FeatureFlagListResponse, ApiError>({
    queryKey: queryKeys.featureFlags.list(),
    queryFn: () => apiGet<FeatureFlagListResponse>("/api/feature-flags"),
  });
}

// ─── Module Hooks ───────────────────────────────────────────────────────────

/**
 * Fetch the list of available modules.
 */
export function useModules() {
  return useQuery<ModuleListResponse, ApiError>({
    queryKey: queryKeys.modules.list(),
    queryFn: () => apiGet<ModuleListResponse>("/api/modules"),
  });
}

// ─── Notification Mutation Hooks ──────────────────────────────────────────────

/**
 * Mark specific notifications as read.
 *
 * On success notification queries are invalidated.
 */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: boolean }, ApiError, { ids: number[] }>({
    mutationFn: (payload) =>
      apiPost<{ ids: number[] }, { ok: boolean }>("/api/notifications", { action: "mark_read", ...payload }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.all,
      });
    },
  });
}

/**
 * Mark all notifications as read.
 *
 * On success notification queries are invalidated.
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: boolean }, ApiError, void>({
    mutationFn: () =>
      apiPost<{ action: string }, { ok: boolean }>("/api/notifications", { action: "mark_all_read" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.all,
      });
    },
  });
}

// ─── Landing Content Hook ─────────────────────────────────────────────────────

interface LandingContentResponse {
  content: Record<string, unknown>;
}

/**
 * Fetch landing page content.
 *
 * This replaces raw fetch in the LandingPage component.
 */
export function useLandingContent() {
  return useQuery<LandingContentResponse, ApiError>({
    queryKey: queryKeys.dashboard.all,
    queryFn: () => apiGet<LandingContentResponse>("/api/landing-content"),
  });
}
