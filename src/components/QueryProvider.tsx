/**
 * QueryProvider — Client-side wrapper for TanStack React Query.
 *
 * The QueryClient must be created on the client (it stores class instances,
 * not plain objects, so it can't be serialized across the RSC boundary).
 * Using `useState` ensures a stable instance per browser session.
 *
 * P2-A: React Query setup for server state management.
 */
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
