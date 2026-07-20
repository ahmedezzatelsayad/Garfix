/**
 * ai.ts — React Query hooks for AI agents, memory, and intelligent features.
 *
 * Provides typed query and mutation hooks for AI agent management, memory
 * CRUD, invoice brain statistics, extraction, smart parsing, chat, and
 * file parsing. All hooks use the centralized `queryKeys` factory for
 * granular cache invalidation and the typed `apiGet`/`apiPost`/`apiDelete`/
 * `apiUpload` helpers for consistent requests.
 */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  apiGet,
  apiPost,
  apiDelete,
  apiUpload,
  ApiError,
} from "@/hooks/api-client";
import { queryKeys } from "@/hooks/query-keys";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Shape of an AI agent record returned by the API. */
export interface AIAgent {
  id: number;
  name: string;
  type: string;
  config: Record<string, unknown>;
  companySlug: string;
  [key: string]: unknown;
}

/** Shape of an AI memory record returned by the API. */
export interface AIMemory {
  id: number;
  key: string;
  value: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Shape of the Invoice Brain statistics returned by the API. */
export interface InvoiceBrainStats {
  totalProcessed: number;
  successRate: number;
  avgConfidence: number;
  [key: string]: unknown;
}

/** Payload for creating a new AI agent. */
export interface CreateAIAgentPayload {
  name: string;
  type: string;
  config?: Record<string, unknown>;
  companySlug: string;
  [key: string]: unknown;
}

/** Payload for creating a new AI memory entry. */
export interface CreateAIMemoryPayload {
  key: string;
  value: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Payload for the invoice extraction mutation. */
export interface ExtractInvoicePayload {
  fileUrl?: string;
  fileData?: string;
  companySlug: string;
  [key: string]: unknown;
}

/** Payload for the smart parse mutation. */
export interface SmartParsePayload {
  content: string;
  type?: string;
  companySlug?: string;
  [key: string]: unknown;
}

/** Payload for the AI chat mutation. */
export interface AIChatPayload {
  message: string;
  agentId?: number;
  companySlug?: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Response shape for the AI agents list endpoint. */
interface AIAgentListResponse {
  agents: AIAgent[];
}

/** Response shape for the AI memory list endpoint. */
interface AIMemoryListResponse {
  memory: AIMemory[];
}

// ─── Query Hooks ────────────────────────────────────────────────────────────

/**
 * Fetch a list of AI agents for a given company.
 *
 * The query is disabled when `companySlug` is empty, preventing
 * unnecessary requests before the active company is known.
 *
 * @param companySlug - Slug of the company whose AI agents to fetch.
 */
export function useAIAgents(companySlug: string) {
  return useQuery<AIAgentListResponse, ApiError>({
    queryKey: queryKeys.ai.agents(companySlug),
    queryFn: () =>
      apiGet<AIAgentListResponse>(
        `/api/ai/agents?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Fetch AI memory entries for a given company.
 *
 * @param companySlug - Slug of the company whose AI memory to fetch.
 */
export function useAIMemory(companySlug: string) {
  return useQuery<AIMemoryListResponse, ApiError>({
    queryKey: queryKeys.ai.memory(companySlug),
    queryFn: () =>
      apiGet<AIMemoryListResponse>(
        `/api/ai/memory?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/**
 * Fetch Invoice Brain statistics for a given company.
 *
 * Returns aggregate stats such as total processed invoices,
 * success rate, and average confidence score.
 *
 * @param companySlug - Slug of the company whose Invoice Brain stats to fetch.
 */
export function useInvoiceBrainStats(companySlug: string) {
  return useQuery<InvoiceBrainStats, ApiError>({
    queryKey: queryKeys.ai.invoiceBrainStats(companySlug),
    queryFn: () =>
      apiGet<InvoiceBrainStats>(
        `/api/ai/invoice-brain/stats?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

// ─── Mutation Hooks ─────────────────────────────────────────────────────────

/**
 * Create a new AI agent.
 *
 * On success all AI agent queries are invalidated so every mounted
 * list view refetches with the new entry.
 */
export function useCreateAIAgent() {
  const queryClient = useQueryClient();

  return useMutation<AIAgent, ApiError, CreateAIAgentPayload>({
    mutationFn: (payload) =>
      apiPost<CreateAIAgentPayload, AIAgent>("/api/ai/agents", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.ai.all,
      });
    },
  });
}

/**
 * Create a new AI memory entry.
 *
 * On success all AI memory queries are invalidated so every mounted
 * list view refetches with the new entry.
 */
export function useCreateAIMemory() {
  const queryClient = useQueryClient();

  return useMutation<AIMemory, ApiError, CreateAIMemoryPayload>({
    mutationFn: (payload) =>
      apiPost<CreateAIMemoryPayload, AIMemory>("/api/ai/memory", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.ai.all,
      });
    },
  });
}

/**
 * Delete an AI memory entry by ID.
 *
 * On success all AI memory queries are invalidated so every mounted
 * list view refetches without the deleted entry.
 */
export function useDeleteAIMemory() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, number>({
    mutationFn: (id) => apiDelete<void>(`/api/ai/memory/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.ai.all,
      });
    },
  });
}

/**
 * Extract data from an invoice using the Invoice Brain AI service.
 *
 * This is a fire-and-forget style mutation — it does not invalidate
 * any query caches automatically. Callers should invalidate relevant
 * queries (e.g. invoice lists or brain stats) based on their use case.
 */
export function useExtractInvoice() {
  return useMutation<Record<string, unknown>, ApiError, ExtractInvoicePayload>({
    mutationFn: (payload) =>
      apiPost<ExtractInvoicePayload, Record<string, unknown>>(
        "/api/ai/invoice-brain/extract",
        payload,
      ),
  });
}

/**
 * Smart-parse content using the AI service.
 *
 * Sends free-form content to the AI smart parser and returns
 * structured data. This is a fire-and-forget style mutation —
 * it does not invalidate any query caches automatically.
 */
export function useSmartParse() {
  return useMutation<Record<string, unknown>, ApiError, SmartParsePayload>({
    mutationFn: (payload) =>
      apiPost<SmartParsePayload, Record<string, unknown>>(
        "/api/ai/smart-parse",
        payload,
      ),
  });
}

/**
 * Send a message to the AI chat endpoint.
 *
 * This is a fire-and-forget style mutation — it does not invalidate
 * any query caches automatically. Callers may wish to append the
 * response to a local conversation state.
 */
export function useAIChat() {
  return useMutation<Record<string, unknown>, ApiError, AIChatPayload>({
    mutationFn: (payload) =>
      apiPost<AIChatPayload, Record<string, unknown>>("/api/ai/chat", payload),
  });
}

/**
 * Parse a file using the AI service.
 *
 * Uses `apiUpload` for multipart/form-data file upload. This is a
 * fire-and-forget style mutation — it does not invalidate any query
 * caches automatically.
 */
export function useParseFile() {
  return useMutation<Record<string, unknown>, ApiError, FormData>({
    mutationFn: (formData) =>
      apiUpload<Record<string, unknown>>("/api/ai/parse-file", formData),
  });
}
