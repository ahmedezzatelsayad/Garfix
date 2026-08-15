/**
 * product-matching.ts — React Query hooks for product matching review,
 * config, confirm, and undo operations.
 *
 * All hooks use the centralized `queryKeys` factory and the typed
 * `apiGet`/`apiPost` helpers for consistent requests.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, ApiError } from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProductMatchItem {
  id: string;
  inputName: string;
  matchedName: string;
  confidence: number;
  status: "pending" | "confirmed" | "rejected";
  companySlug: string;
  [key: string]: unknown;
}

interface ProductMatchConfig {
  id: string;
  threshold: number;
  algorithm: "fuzzy" | "exact" | "semantic";
  companySlug: string;
  isActive: boolean;
  [key: string]: unknown;
}

interface ProductMatchReviewResponse {
  data: ProductMatchItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface ProductMatchConfigResponse {
  config: ProductMatchConfig;
}

interface ConfirmPayload {
  matchId: string;
  companyId: string;
}

interface UndoPayload {
  matchId: string;
}

// ─── useProductMatchingReview ────────────────────────────────────────────────

export function useProductMatchingReview(companySlug: string) {
  return useQuery<ProductMatchReviewResponse, ApiError>({
    queryKey: queryKeys.productMatching.review(companySlug),
    queryFn: () =>
      apiGet<ProductMatchReviewResponse>(
        `/api/product-matching/review?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

// ─── useProductMatchingConfig ────────────────────────────────────────────────

export function useProductMatchingConfig(companySlug: string) {
  return useQuery<ProductMatchConfigResponse, ApiError>({
    queryKey: queryKeys.productMatching.config(companySlug),
    queryFn: () =>
      apiGet<ProductMatchConfigResponse>(
        `/api/product-matching/config?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

// ─── useProductMatchingConfirm ───────────────────────────────────────────────

export function useProductMatchingConfirm() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: boolean }, ApiError, ConfirmPayload>({
    mutationFn: (payload) =>
      apiPost<ConfirmPayload, { ok: boolean }>("/api/product-matching/confirm", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.productMatching.all,
      });
    },
  });
}

// ─── useProductMatchingUndo ──────────────────────────────────────────────────

export function useProductMatchingUndo() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: boolean }, ApiError, UndoPayload>({
    mutationFn: (payload) =>
      apiPost<UndoPayload, { ok: boolean }>("/api/product-matching/undo", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.productMatching.all,
      });
    },
  });
}
