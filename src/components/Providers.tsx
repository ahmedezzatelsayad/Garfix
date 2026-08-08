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
        retry: 1,                // Only retry once on failure
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

  // VERCEL FIX: disable SSR for ThemeProvider to prevent hydration mismatch.
  // next-themes mutates <html> className on mount which causes React to
  // discard the entire client render. With enableSystem=false + defaultTheme="light",
  // the server renders light theme, and the client picks up the stored theme
  // after hydration without mismatch.
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="garfix:theme" disableTransitionOnChange>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <BrandProvider>
            {children}
          </BrandProvider>
          {process.env.NODE_ENV === "development" && (
            <ReactQueryDevtools initialIsOpen={false} />
          )}
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
