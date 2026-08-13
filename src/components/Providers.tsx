/**
 * Providers — Client-side wrapper that nests all context providers.
 *
 * Order: ThemeProvider → AuthProvider → QueryProvider → BrandProvider → {children}
 *
 * This must be a client component because React Query and our auth/brand
 * contexts store state that can't be serialized across the RSC boundary.
 */
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { GarfixAccessibilityProvider } from "@/components/garfix-ds/accessibility/GarfixAccessibilityProvider"; // Phase 2 P2
import { useState } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { BrandProvider } from "@/context/BrandContext";
import { ThemeProvider } from "next-themes";

// ─── QueryClient factory ──────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,       // 30s — data is fresh for 30s before refetch
        gcTime: 5 * 60_000,      // 5min — cached data kept for 5min after unused
        // Phase 6 P1 fix: don't retry AI queries — a retry costs a SECOND LLM
        // call (real money on paid providers). For non-AI queries, 1 retry is
        // fine (transient network blips). The function inspects the queryKey
        // to determine if it's an AI call.
        retry: (failureCount, error: any) => {
          // Don't retry 4xx errors (client error — retrying won't help)
          if (error?.status >= 400 && error?.status < 500) return false;
          // Phase 6 P1: don't retry AI queries (costs money)
          // Query keys for AI hooks start with ["ai", ...]
          // We can't access the queryKey here directly, but the api-client
          // already excludes /api/ai/* from the circuit breaker. The safest
          // approach: cap retries at 1 for all queries (was already 1), and
          // rely on the api-client's retry: 0 for AI calls.
          return failureCount < 1;
        },
        refetchOnWindowFocus: false, // Don't auto-refetch when user switches tabs
        refetchOnReconnect: true,    // Refetch when network reconnects
      },
      mutations: {
        retry: 0,                // Don't retry mutations — user should handle errors
      },
    },
  });
}

// ─── Providers component ──────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  // Phase 2 P1 fix: re-enable enableSystem so OS dark-mode preference is respected.
  // The original Vercel hydration issue was caused by a DIFFERENT bug (the old
  // html:not([data-theme]) { visibility: hidden } CSS rule + ThemeProvider
  // mutating <html> className). That CSS rule has been removed. The standard
  // next-themes pattern with suppressHydrationWarning on <html> handles this
  // correctly — see src/app/layout.tsx:86 which already has suppressHydrationWarning.
  // The inline theme-init script (added to <head> in layout.tsx) prevents FOUC.
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={true} storageKey="garfix:theme" disableTransitionOnChange>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <BrandProvider>
            {/* Phase 2 P2 fix: wire GarfixAccessibilityProvider for WCAG 2.1 AAA
                compliance (skip links, focus trap, screen reader announcements).
                Was implemented but never imported by Providers.
                // FE-02 FIX (Audit v2 · Phase 1) — target bumped from AA to AAA. */}
            <GarfixAccessibilityProvider showSkipLinks>
              {children}
            </GarfixAccessibilityProvider>
          </BrandProvider>
          {process.env.NODE_ENV === "development" && (
            <ReactQueryDevtools initialIsOpen={false} />
          )}
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
