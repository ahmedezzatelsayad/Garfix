/**
 * auth.ts — React Query hooks for authentication endpoints.
 *
 * Provides typed query and mutation hooks for login, logout, user profile,
 * password management, and password reset flows. All hooks use the centralized
 * `queryKeys` factory for cache management and the `apiGet`/`apiPost` helpers
 * for consistent request handling.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, ApiError } from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Shape of the authenticated user profile returned by `/api/auth/me`. */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  companies: string[];
  role: string;
  permissions?: Record<string, number>;
  effectivePermissions?: Record<string, number>;
  isFounder?: boolean;
  emailVerified?: boolean;
}

/** Credentials sent when logging in. */
interface LoginPayload {
  email: string;
  password: string;
}

/** Payload for changing the user's password. */
interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

/** Payload for requesting a password reset email. */
interface ForgotPasswordPayload {
  email: string;
}

/** Payload for resetting a password with a token. */
interface ResetPasswordPayload {
  token: string;
  newPassword: string;
}

// ─── Query Hooks ────────────────────────────────────────────────────────────

/**
 * Fetch the currently authenticated user profile.
 *
 * Uses `useQuery` with the `queryKeys.auth.me()` key. Returns `null` when
 * the user is not authenticated (401) instead of throwing, so the UI can
 * distinguish between "loading", "unauthenticated", and "authenticated".
 */
export function useUser() {
  return useQuery<UserProfile | null, ApiError>({
    queryKey: queryKeys.auth.me(),
    queryFn: async () => {
      try {
        return await apiGet<UserProfile>("/api/auth/me");
      } catch (error) {
        // A 401 means the user is not authenticated — return null instead of erroring
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes — user profile doesn't change often
    retry: (failureCount, error) => {
      // Don't retry on 401 — the user is simply not logged in
      if (error instanceof ApiError && error.status === 401) return false;
      return failureCount < 3;
    },
  });
}

// ─── Mutation Hooks ─────────────────────────────────────────────────────────

/**
 * Log in with email and password.
 *
 * On success the `queryKeys.auth.me()` cache is invalidated so that
 * `useUser()` refetches the freshly-authenticated profile.
 */
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation<UserProfile, ApiError, LoginPayload>({
    mutationFn: (payload) =>
      apiPost<LoginPayload, UserProfile>("/api/auth/login", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });
}

/**
 * Log the current user out.
 *
 * On success the entire query client cache is reset, ensuring no stale
 * user-specific data remains after the session ends.
 */
export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, void>({
    mutationFn: () => apiPost<void, void>("/api/auth/logout"),
    onSuccess: () => {
      void queryClient.resetQueries();
    },
  });
}

/**
 * Change the current user's password.
 *
 * Sends the current and new passwords to `/api/auth/change-password`.
 * Does not invalidate any queries on success — password changes don't
 * affect the cached user profile.
 */
export function useChangePassword() {
  return useMutation<void, ApiError, ChangePasswordPayload>({
    mutationFn: (payload) =>
      apiPost<ChangePasswordPayload, void>("/api/auth/change-password", payload),
  });
}

/**
 * Request a password reset email.
 *
 * Sends the user's email address to `/api/auth/forgot-password`.
 * The server sends a reset link if the email exists; no cache
 * invalidation is needed.
 */
export function useForgotPassword() {
  return useMutation<void, ApiError, ForgotPasswordPayload>({
    mutationFn: (payload) =>
      apiPost<ForgotPasswordPayload, void>("/api/auth/forgot-password", payload),
  });
}

/**
 * Reset a password using a valid reset token.
 *
 * Sends the token and new password to `/api/auth/reset-password`.
 * On success the `queryKeys.auth.me()` cache is invalidated so the
 * user's profile (including `emailVerified` flags) is refreshed.
 */
export function useResetPassword() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, ResetPasswordPayload>({
    mutationFn: (payload) =>
      apiPost<ResetPasswordPayload, void>("/api/auth/reset-password", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });
}
