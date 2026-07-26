/**
 * onboarding.ts — React Query hooks for the onboarding wizard flow.
 *
 * Provides typed query and mutation hooks for checking onboarding status,
 * validating company slugs, completing onboarding steps, and running the
 * AI smart-parse demo during setup.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, ApiError } from "@/hooks/api-client";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OnboardingStatus {
  completed: boolean;
  currentStep?: string;
  companySlug?: string;
  [key: string]: unknown;
}

interface SlugCheckResponse {
  available: boolean;
  [key: string]: unknown;
}

export interface CompleteOnboardingPayload {
  step?: string;
  companySlug?: string;
  businessType?: string;
  country?: string;
  hasEmployees?: boolean;
  hasWarehouse?: boolean;
  usesWhatsApp?: boolean;
  [key: string]: unknown;
}

// ─── Query Hooks ────────────────────────────────────────────────────────────

/**
 * Fetch the current onboarding status for the authenticated user.
 */
export function useOnboardingStatus() {
  return useQuery<OnboardingStatus, ApiError>({
    queryKey: ["onboarding", "status"] as const,
    queryFn: () => apiGet<OnboardingStatus>("/api/onboarding"),
  });
}

/**
 * Check whether a company slug is available for registration.
 *
 * @param slug - The desired company slug to check.
 */
export function useCheckCompanySlug(slug: string) {
  return useQuery<SlugCheckResponse, ApiError>({
    queryKey: ["onboarding", "slug-check", slug] as const,
    queryFn: () =>
      apiGet<SlugCheckResponse>(
        `/api/companies?checkSlug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug,
  });
}

// ─── Mutation Hooks ─────────────────────────────────────────────────────────

/**
 * Complete an onboarding step or finalize onboarding.
 *
 * On success the onboarding status cache is invalidated so the
 * wizard reflects the updated progress.
 */
export function useCompleteOnboarding() {
  const queryClient = useQueryClient();

  return useMutation<OnboardingStatus, ApiError, CompleteOnboardingPayload>({
    mutationFn: (payload) =>
      apiPost<CompleteOnboardingPayload, OnboardingStatus>("/api/onboarding", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["onboarding"] as const,
      });
    },
  });
}

/**
 * Update company settings during onboarding (e.g., set business type, country).
 *
 * On success both the company and onboarding caches are invalidated.
 */
export function useUpdateOnboardingCompany() {
  const queryClient = useQueryClient();

  return useMutation<Record<string, unknown>, ApiError, { slug: string; [key: string]: unknown }>({
    mutationFn: ({ slug, ...data }) =>
      apiPatch<Record<string, unknown>, Record<string, unknown>>(
        `/api/companies/${encodeURIComponent(slug)}`,
        data,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["onboarding"] as const,
      });
      void queryClient.invalidateQueries({
        queryKey: ["companies"] as const,
      });
    },
  });
}
