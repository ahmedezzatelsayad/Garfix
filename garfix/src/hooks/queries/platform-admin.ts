/**
 * platform-admin.ts — React Query hooks for the platform-admin domain.
 *
 * Provides typed query and mutation hooks for tenant management, audit logs,
 * platform stats, AI provider configuration, AI usage & orchestration,
 * feature flags, announcements, integrations, review queue, queue failures,
 * retention cleanup, support tickets, SaaS user management, SaaS payments,
 * and landing content. All hooks use the centralized `queryKeys` factory
 * for granular cache invalidation and the typed `apiGet`/`apiPost`/
 * `apiPatch`/`apiDelete` helpers for consistent request handling.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  apiGet,
  apiPost,
  apiPatch,
  apiDelete,
  ApiError,
} from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Shape of a tenant record returned by the platform-admin API. */
export interface PlatformTenant {
  slug: string;
  name: string;
  status: string;
  [key: string]: unknown;
}

/** Shape of a platform audit log entry. */
export interface PlatformAuditEntry {
  id: number;
  action: string;
  actor: string;
  timestamp: string;
  [key: string]: unknown;
}

/** Shape of the platform statistics response. */
export interface PlatformStats {
  totalTenants: number;
  activeUsers: number;
  revenue: number;
  [key: string]: unknown;
}

/** Shape of an AI provider configuration record. */
export interface AIProvider {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  [key: string]: unknown;
}

/** Shape of the AI usage statistics response. */
export interface AIUsage {
  totalTokens: number;
  totalRequests: number;
  costBreakdown: Record<string, number>;
  [key: string]: unknown;
}

/** Shape of the AI orchestration configuration response. */
export interface AIOrchestration {
  routingStrategy: string;
  fallbackProvider: string;
  rules: Record<string, unknown>;
  [key: string]: unknown;
}

/** Shape of a feature flag record. */
export interface PlatformFeatureFlag {
  id: number;
  key: string;
  name: string;
  enabled: boolean;
  description?: string;
  [key: string]: unknown;
}

/** Payload for creating a new feature flag. */
export interface CreateFeatureFlagPayload {
  key: string;
  name: string;
  enabled: boolean;
  description?: string;
  [key: string]: unknown;
}

/** Payload for updating an existing feature flag. */
export interface UpdateFeatureFlagPayload {
  id: number;
  [key: string]: unknown;
}

/** Shape of an announcement record. */
export interface PlatformAnnouncement {
  id: number;
  title: string;
  body: string;
  type: string;
  publishedAt?: string;
  [key: string]: unknown;
}

/** Payload for creating a new announcement. */
export interface CreateAnnouncementPayload {
  title: string;
  body: string;
  type: string;
  [key: string]: unknown;
}

/** Payload for updating an existing announcement. */
export interface UpdateAnnouncementPayload {
  id: number;
  [key: string]: unknown;
}

/** Shape of a platform integration record. */
export interface PlatformIntegration {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  [key: string]: unknown;
}

/** Shape of a review queue entry. */
export interface ReviewQueueEntry {
  id: number;
  entityType: string;
  entityId: string;
  status: string;
  submittedAt: string;
  [key: string]: unknown;
}

/** Shape of a queue failure record. */
export interface QueueFailure {
  id: number;
  queueName: string;
  errorMessage: string;
  failedAt: string;
  [key: string]: unknown;
}

/** Shape of a support ticket record. */
export interface PlatformTicket {
  id: number;
  subject: string;
  status: string;
  priority: string;
  createdBy: string;
  [key: string]: unknown;
}

/** Payload for updating a support ticket. */
export interface UpdateTicketPayload {
  id: number;
  [key: string]: unknown;
}

/** Payload for replying to a support ticket. */
export interface ReplyToTicketPayload {
  id: number;
  message: string;
  [key: string]: unknown;
}

/** Shape of a SaaS user record. */
export interface SaaSUser {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  [key: string]: unknown;
}

/** Payload for updating a SaaS user. */
export interface UpdateSaaSUserPayload {
  uid: string;
  [key: string]: unknown;
}

/** Shape of a SaaS payment record. */
export interface SaaSPayment {
  id: number;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  [key: string]: unknown;
}

/** Payload for initiating a SaaS payment. */
export interface InitiatePaymentPayload {
  userId: string;
  amount: number;
  currency: string;
  [key: string]: unknown;
}

/** Shape of the landing page content response. */
export interface LandingContent {
  heroTitle: string;
  heroSubtitle: string;
  sections: Record<string, unknown>[];
  [key: string]: unknown;
}

/** Payload for updating a tenant. */
export interface UpdateTenantPayload {
  slug: string;
  [key: string]: unknown;
}

// ─── Platform Admin Query Hooks ─────────────────────────────────────────────

/**
 * Fetch the list of all platform tenants.
 *
 * Returns every tenant registered on the platform including their
 * slug, name, and current status.
 */
export function usePlatformTenants() {
  return useQuery<PlatformTenant[], ApiError>({
    queryKey: queryKeys.platformAdmin.tenants(),
    queryFn: () =>
      apiGet<PlatformTenant[]>("/api/platform-admin/tenants"),
  });
}

/**
 * Fetch a single platform tenant by its slug.
 *
 * The query is disabled when `slug` is empty, preventing
 * unnecessary requests before a tenant is selected.
 *
 * @param slug - Slug of the tenant to fetch.
 */
export function usePlatformTenant(slug: string) {
  return useQuery<PlatformTenant, ApiError>({
    queryKey: queryKeys.platformAdmin.tenantDetail(slug),
    queryFn: () =>
      apiGet<PlatformTenant>(`/api/platform-admin/tenants/${encodeURIComponent(slug)}`),
    enabled: !!slug,
  });
}

/**
 * Fetch the platform audit log.
 *
 * Returns a list of all audit events recorded across the platform,
 * including actor, action, and timestamp.
 */
export function usePlatformAudit() {
  return useQuery<PlatformAuditEntry[], ApiError>({
    queryKey: queryKeys.platformAdmin.audit(),
    queryFn: () =>
      apiGet<PlatformAuditEntry[]>("/api/platform-admin/audit"),
  });
}

/**
 * Fetch aggregated platform statistics.
 *
 * Returns high-level metrics such as total tenants, active users,
 * and revenue. Uses an extended `staleTime` of 2 minutes because
 * platform stats change infrequently and don't need real-time freshness.
 */
export function usePlatformStats() {
  return useQuery<PlatformStats, ApiError>({
    queryKey: queryKeys.platformAdmin.stats(),
    queryFn: () =>
      apiGet<PlatformStats>("/api/platform-admin/stats"),
    staleTime: 120_000,
  });
}

/**
 * Fetch the list of configured AI providers.
 *
 * Returns all AI provider integrations available on the platform
 * with their configuration and enabled status.
 */
export function useAIProviders() {
  return useQuery<AIProvider[], ApiError>({
    queryKey: queryKeys.platformAdmin.aiProviders(),
    queryFn: () =>
      apiGet<AIProvider[]>("/api/platform-admin/ai-providers"),
  });
}

/**
 * Fetch AI usage statistics across the platform.
 *
 * Returns token counts, request counts, and cost breakdowns
 * for all AI provider usage.
 */
export function useAIUsage() {
  return useQuery<AIUsage, ApiError>({
    queryKey: queryKeys.platformAdmin.aiUsage(),
    queryFn: () =>
      apiGet<AIUsage>("/api/platform-admin/ai-usage"),
  });
}

/**
 * Fetch the AI orchestration configuration.
 *
 * Returns routing strategy, fallback provider, and rule set
 * that govern how AI requests are distributed across providers.
 */
export function useAIOrchestration() {
  return useQuery<AIOrchestration, ApiError>({
    queryKey: queryKeys.platformAdmin.aiOrchestration(),
    queryFn: () =>
      apiGet<AIOrchestration>("/api/platform-admin/ai-orchestration"),
  });
}

/**
 * Fetch all platform feature flags.
 *
 * Returns the complete list of feature flags including their
 * key, name, enabled status, and description.
 */
export function usePlatformFeatureFlags() {
  return useQuery<PlatformFeatureFlag[], ApiError>({
    queryKey: queryKeys.platformAdmin.featureFlags(),
    queryFn: () =>
      apiGet<PlatformFeatureFlag[]>("/api/platform-admin/feature-flags"),
  });
}

/**
 * Fetch all platform announcements.
 *
 * Returns published and draft announcements managed by platform
 * administrators for user-facing notifications.
 */
export function usePlatformAnnouncements() {
  return useQuery<PlatformAnnouncement[], ApiError>({
    queryKey: queryKeys.platformAdmin.announcements(),
    queryFn: () =>
      apiGet<PlatformAnnouncement[]>("/api/platform-admin/announcements"),
  });
}

/**
 * Fetch all platform integrations.
 *
 * Returns the list of third-party integrations configured at the
 * platform level including their status and configuration.
 */
export function usePlatformIntegrations() {
  return useQuery<PlatformIntegration[], ApiError>({
    queryKey: queryKeys.platformAdmin.integrations(),
    queryFn: () =>
      apiGet<PlatformIntegration[]>("/api/platform-admin/integrations"),
  });
}

/**
 * Fetch the review queue for platform administrators.
 *
 * Returns items pending admin review such as content submissions,
 * tenant applications, or flagged resources.
 */
export function useReviewQueue() {
  return useQuery<ReviewQueueEntry[], ApiError>({
    queryKey: queryKeys.platformAdmin.reviewQueue(),
    queryFn: () =>
      apiGet<ReviewQueueEntry[]>("/api/platform-admin/review-queue"),
  });
}

/**
 * Fetch the list of queue processing failures.
 *
 * Returns records of background jobs that failed processing,
 * including error messages and timestamps for troubleshooting.
 */
export function useQueueFailures() {
  return useQuery<QueueFailure[], ApiError>({
    queryKey: queryKeys.platformAdmin.queueFailures(),
    queryFn: () =>
      apiGet<QueueFailure[]>("/api/platform-admin/queue-failures"),
  });
}

/**
 * Fetch all support tickets visible to platform administrators.
 *
 * Returns a list of tickets with their subject, status, priority,
 * and creator information.
 */
export function usePlatformTickets() {
  return useQuery<PlatformTicket[], ApiError>({
    queryKey: queryKeys.platformAdmin.tickets(),
    queryFn: () =>
      apiGet<PlatformTicket[]>("/api/platform-admin/tickets"),
  });
}

// ─── Platform Admin Mutation Hooks ──────────────────────────────────────────

/**
 * Update an existing platform tenant.
 *
 * Accepts the tenant slug plus any updatable fields. On success
 * both the tenants list and the specific tenant detail caches
 * are invalidated so all views reflect the latest data.
 *
 * Variables shape: `{ slug: string, ...data }`
 */
export function useUpdatePlatformTenant() {
  const queryClient = useQueryClient();

  return useMutation<PlatformTenant, ApiError, UpdateTenantPayload>({
    mutationFn: ({ slug, ...data }) =>
      apiPatch<Record<string, unknown>, PlatformTenant>(
        `/api/platform-admin/tenants/${encodeURIComponent(slug)}`,
        data,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.platformAdmin.tenants(),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.platformAdmin.tenantDetail(variables.slug),
      });
    },
  });
}

/**
 * Delete a platform tenant by slug.
 *
 * On success the tenants list is invalidated and the specific
 * tenant detail cache entry is removed so stale data does not
 * persist for a deleted tenant.
 *
 * Variables shape: `{ slug: string }`
 */
export function useDeletePlatformTenant() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, { slug: string }>({
    mutationFn: ({ slug }) =>
      apiDelete<void>(`/api/platform-admin/tenants/${encodeURIComponent(slug)}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.platformAdmin.tenants(),
      });
      void queryClient.removeQueries({
        queryKey: queryKeys.platformAdmin.tenantDetail(variables.slug),
      });
    },
  });
}

/**
 * Update the AI provider configuration.
 *
 * Sends a partial update to the AI providers settings. On success
 * the AI providers cache is invalidated so the updated configuration
 * is reflected in any mounted views.
 */
export function useUpdateAIProviders() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, Record<string, unknown>>({
    mutationFn: (data) =>
      apiPatch<Record<string, unknown>, void>("/api/platform-admin/ai-providers", data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.platformAdmin.aiProviders(),
      });
    },
  });
}

/**
 * Test an AI provider connection.
 *
 * Sends a test request to the specified AI provider to verify
 * connectivity and credentials. This is a fire-and-forget style
 * mutation — it does not invalidate any query caches automatically.
 */
export function useTestAIProvider() {
  return useMutation<Record<string, unknown>, ApiError, Record<string, unknown>>({
    mutationFn: (payload) =>
      apiPost<Record<string, unknown>, Record<string, unknown>>(
        "/api/platform-admin/ai-providers/test",
        payload,
      ),
  });
}

/**
 * Update the AI orchestration configuration.
 *
 * Sends a partial update to the orchestration settings such as
 * routing strategy or fallback provider. On success the AI
 * orchestration cache is invalidated.
 */
export function useUpdateAIOrchestration() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, Record<string, unknown>>({
    mutationFn: (data) =>
      apiPatch<Record<string, unknown>, void>("/api/platform-admin/ai-orchestration", data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.platformAdmin.aiOrchestration(),
      });
    },
  });
}

/**
 * Run an AI benchmark across configured providers.
 *
 * Triggers a benchmark job that evaluates provider performance.
 * This is a fire-and-forget style mutation — it does not
 * invalidate any query caches automatically. Callers may wish to
 * poll or refetch AI usage/orchestration data after completion.
 */
export function useRunBenchmark() {
  return useMutation<Record<string, unknown>, ApiError, Record<string, unknown>>({
    mutationFn: (payload) =>
      apiPost<Record<string, unknown>, Record<string, unknown>>(
        "/api/platform-admin/ai-orchestration/run-benchmark",
        payload,
      ),
  });
}

/**
 * Create a new platform feature flag.
 *
 * On success the feature flags list cache is invalidated so any
 * mounted views pick up the newly created flag.
 */
export function useCreatePlatformFeatureFlag() {
  const queryClient = useQueryClient();

  return useMutation<PlatformFeatureFlag, ApiError, CreateFeatureFlagPayload>({
    mutationFn: (payload) =>
      apiPost<CreateFeatureFlagPayload, PlatformFeatureFlag>(
        "/api/platform-admin/feature-flags",
        payload,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.platformAdmin.featureFlags(),
      });
    },
  });
}

/**
 * Update an existing platform feature flag.
 *
 * Accepts the flag ID plus any updatable fields. On success the
 * feature flags list cache is invalidated so all views reflect
 * the updated flag state.
 *
 * Variables shape: `{ id: number, ...data }`
 */
export function useUpdatePlatformFeatureFlag() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, UpdateFeatureFlagPayload>({
    mutationFn: ({ id, ...data }) =>
      apiPatch<Record<string, unknown>, void>(
        `/api/platform-admin/feature-flags/${id}`,
        data,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.platformAdmin.featureFlags(),
      });
    },
  });
}

/**
 * Delete a platform feature flag by ID.
 *
 * On success the feature flags list cache is invalidated so the
 * deleted flag is removed from all mounted views.
 *
 * Variables shape: `{ id: number }`
 */
export function useDeletePlatformFeatureFlag() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, { id: number }>({
    mutationFn: ({ id }) =>
      apiDelete<void>(`/api/platform-admin/feature-flags/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.platformAdmin.featureFlags(),
      });
    },
  });
}

/**
 * Create a new platform announcement.
 *
 * On success the announcements list cache is invalidated so any
 * mounted views pick up the newly created announcement.
 */
export function useCreateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation<PlatformAnnouncement, ApiError, CreateAnnouncementPayload>({
    mutationFn: (payload) =>
      apiPost<CreateAnnouncementPayload, PlatformAnnouncement>(
        "/api/platform-admin/announcements",
        payload,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.platformAdmin.announcements(),
      });
    },
  });
}

/**
 * Update an existing platform announcement.
 *
 * Accepts the announcement ID plus any updatable fields. On success
 * the announcements list cache is invalidated so all views reflect
 * the updated announcement.
 *
 * Variables shape: `{ id: number, ...data }`
 */
export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, UpdateAnnouncementPayload>({
    mutationFn: ({ id, ...data }) =>
      apiPatch<Record<string, unknown>, void>(
        `/api/platform-admin/announcements/${id}`,
        data,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.platformAdmin.announcements(),
      });
    },
  });
}

/**
 * Delete a platform announcement by ID.
 *
 * On success the announcements list cache is invalidated so the
 * deleted announcement is removed from all mounted views.
 *
 * Variables shape: `{ id: number }`
 */
export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, { id: number }>({
    mutationFn: ({ id }) =>
      apiDelete<void>(`/api/platform-admin/announcements/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.platformAdmin.announcements(),
      });
    },
  });
}

/**
 * Update the platform integrations configuration.
 *
 * Sends a partial update to the integrations settings. On success
 * the integrations cache is invalidated so the updated configuration
 * is reflected in any mounted views.
 */
export function useUpdatePlatformIntegrations() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, Record<string, unknown>>({
    mutationFn: (data) =>
      apiPatch<Record<string, unknown>, void>("/api/platform-admin/integrations", data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.platformAdmin.integrations(),
      });
    },
  });
}

/**
 * Test a platform integration connection.
 *
 * Sends a test request to verify connectivity and credentials
 * for a given integration. This is a fire-and-forget style
 * mutation — it does not invalidate any query caches automatically.
 */
export function useTestIntegration() {
  return useMutation<Record<string, unknown>, ApiError, Record<string, unknown>>({
    mutationFn: (payload) =>
      apiPost<Record<string, unknown>, Record<string, unknown>>(
        "/api/platform-admin/integrations/test",
        payload,
      ),
  });
}

/**
 * Trigger a retention cleanup job across the platform.
 *
 * Initiates the data retention policy enforcement which purges
 * expired records according to configured rules. This is a
 * fire-and-forget style mutation — it does not invalidate any
 * query caches automatically. Callers may wish to invalidate
 * audit or stats queries after the job completes.
 */
export function useRetentionCleanup() {
  return useMutation<Record<string, unknown>, ApiError, Record<string, unknown>>({
    mutationFn: (payload) =>
      apiPost<Record<string, unknown>, Record<string, unknown>>(
        "/api/platform-admin/retention-cleanup",
        payload,
      ),
  });
}

/**
 * Update a support ticket.
 *
 * Accepts the ticket ID plus any updatable fields such as status
 * or priority. On success the tickets list cache is invalidated
 * so all views reflect the updated ticket.
 *
 * Variables shape: `{ id: number, ...data }`
 */
export function useUpdatePlatformTicket() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, UpdateTicketPayload>({
    mutationFn: ({ id, ...data }) =>
      apiPatch<Record<string, unknown>, void>(
        `/api/platform-admin/tickets/${id}`,
        data,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.platformAdmin.tickets(),
      });
    },
  });
}

/**
 * Reply to a support ticket.
 *
 * Appends a new reply from a platform administrator to the
 * specified ticket. On success the tickets list cache is
 * invalidated so any mounted views reflect the new reply.
 *
 * Variables shape: `{ id: number, message: string, ...data }`
 */
export function useReplyToTicket() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, ReplyToTicketPayload>({
    mutationFn: ({ id, ...data }) =>
      apiPost<Record<string, unknown>, void>(
        `/api/platform-admin/tickets/${id}/replies`,
        data,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.platformAdmin.tickets(),
      });
    },
  });
}

// ─── SaaS Query Hooks ───────────────────────────────────────────────────────

/**
 * Fetch the list of all SaaS users.
 *
 * Returns every user registered on the SaaS platform including
 * their uid, email, display name, role, and status.
 */
export function useSaaSUsers() {
  return useQuery<SaaSUser[], ApiError>({
    queryKey: queryKeys.saas.users(),
    queryFn: () =>
      apiGet<SaaSUser[]>("/api/saas/users"),
  });
}

/**
 * Fetch the list of all SaaS payment records.
 *
 * Returns payment history including amounts, currencies,
 * statuses, and timestamps.
 */
export function useSaaSPayments() {
  return useQuery<SaaSPayment[], ApiError>({
    queryKey: queryKeys.saas.payments(),
    queryFn: () =>
      apiGet<SaaSPayment[]>("/api/saas/payments"),
  });
}

/**
 * Fetch the public landing page content.
 *
 * Returns the hero section text, subtitle, and configurable
 * sections that make up the marketing landing page.
 */
export function useLandingContent() {
  return useQuery<LandingContent, ApiError>({
    queryKey: ["landing-content"] as const,
    queryFn: () =>
      apiGet<LandingContent>("/api/landing-content"),
  });
}

// ─── SaaS Mutation Hooks ────────────────────────────────────────────────────

/**
 * Update a SaaS user.
 *
 * Accepts the user uid plus any updatable fields. On success
 * the SaaS users list cache is invalidated so all views reflect
 * the updated user data.
 *
 * Variables shape: `{ uid: string, ...data }`
 */
export function useUpdateSaaSUser() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, UpdateSaaSUserPayload>({
    mutationFn: ({ uid, ...data }) =>
      apiPatch<Record<string, unknown>, void>(
        `/api/saas/users/${encodeURIComponent(uid)}`,
        data,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.saas.users(),
      });
    },
  });
}

/**
 * Delete a SaaS user by uid.
 *
 * On success the SaaS users list cache is invalidated so the
 * deleted user is removed from all mounted views.
 *
 * Variables shape: `{ uid: string }`
 */
export function useDeleteSaaSUser() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, { uid: string }>({
    mutationFn: ({ uid }) =>
      apiDelete<void>(`/api/saas/users/${encodeURIComponent(uid)}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.saas.users(),
      });
    },
  });
}

/**
 * Initiate a new SaaS payment.
 *
 * Sends payment details to the payment gateway. This is a
 * fire-and-forget style mutation — it does not invalidate any
 * query caches automatically. Callers may wish to invalidate
 * the SaaS payments query after the payment is processed.
 */
export function useInitiatePayment() {
  return useMutation<Record<string, unknown>, ApiError, InitiatePaymentPayload>({
    mutationFn: (payload) =>
      apiPost<InitiatePaymentPayload, Record<string, unknown>>(
        "/api/saas/payments/initiate",
        payload,
      ),
  });
}

/**
 * Update the landing page content.
 *
 * Sends a partial update to the landing page content managed
 * by platform administrators. This is a fire-and-forget style
 * mutation — it does not invalidate any query caches
 * automatically. Callers may wish to invalidate the
 * `useLandingContent` query after the update succeeds.
 */
export function useUpdateLandingContent() {
  return useMutation<void, ApiError, Record<string, unknown>>({
    mutationFn: (data) =>
      apiPatch<Record<string, unknown>, void>("/api/platform-admin/landing-content", data),
  });
}
