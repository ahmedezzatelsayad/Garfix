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
    mutationFn: async (payload) => {
      // Use the per-client AI proxy when companySlug is available.
      // This routes through the per-feature router with encrypted keys,
      // Valkey-distributed rate limiting, and pool fallback.
      if (payload.companySlug) {
        const proxyUrl = `/api/ai/proxy/${payload.companySlug}?feature=chat`;
        return apiPost<AIChatPayload, Record<string, unknown>>(proxyUrl, payload);
      }
      // Fallback to the legacy endpoint (should not happen in normal flow)
      return apiPost<AIChatPayload, Record<string, unknown>>("/api/ai/chat", payload);
    },
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

/**
 * Parse an image using the AI service.
 *
 * Uses `apiUpload` for multipart/form-data image upload. This is a
 * fire-and-forget style mutation — it does not invalidate any query
 * caches automatically.
 */
export function useParseImage() {
  return useMutation<Record<string, unknown>, ApiError, FormData>({
    mutationFn: (formData) =>
      apiUpload<Record<string, unknown>>("/api/ai/parse-image", formData),
  });
}

/**
 * Bulk-import parsed orders as invoices.
 *
 * Sends parsed order data to the bulk-import endpoint. On success,
 * invoice list queries are invalidated so the new invoices appear
 * in all mounted list views.
 *
 * @param variables - Object containing parsed orders and company context.
 */
export interface BulkImportPayload {
  orders: Array<Record<string, unknown>>;
  companySlug: string;
  autoAddProducts?: boolean;
  createJournalEntries?: boolean;
  [key: string]: unknown;
}

/** Shape of a parsed order from smart parse / invoice brain. */
export interface ParsedOrder {
  clientName: string;
  clientPhone: string;
  clientAddress: string;
  clientEmail?: string;
  items: Array<{ name: string; qty: number; unitPrice: number }>;
  taxRate: number;
  shipping: number;
  discount: number;
  notes: string;
  [key: string]: unknown;
}

export function useBulkImport() {
  const queryClient = useQueryClient();

  return useMutation<Record<string, unknown>, ApiError, BulkImportPayload>({
    mutationFn: (payload) =>
      apiPost<BulkImportPayload, Record<string, unknown>>("/api/ai/bulk-import", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.lists(),
      });
      // P3: تحديث الداشبورد والعملاء بعد الاستيراد المجمع حتى تظهر الفواتير
      // الجديدة في كل الواجهات فورًا (كانت قوائم العملاء والكارت تبقى قديمة).
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
    },
  });
}

/**
 * Fetch AI memory notes scoped to a specific entity (e.g. a client).
 *
 * @param companySlug - Slug of the company.
 * @param entityType  - Type of the entity (e.g. "client").
 * @param entityId    - ID of the entity.
 */
interface EntityMemoryNote {
  id: number;
  companySlug: string;
  entityType: string;
  entityId: number;
  note: string;
  createdBy: string;
  createdAt: string;
}

interface EntityMemoryListResponse {
  notes: EntityMemoryNote[];
}

export function useEntityMemoryNotes(companySlug: string, entityType: string, entityId: number) {
  return useQuery<EntityMemoryListResponse, ApiError>({
    queryKey: [...queryKeys.ai.all, "entity-memory", companySlug, entityType, entityId] as const,
    queryFn: () =>
      apiGet<EntityMemoryListResponse>(
        `/api/ai/memory?companySlug=${encodeURIComponent(companySlug)}&entityType=${encodeURIComponent(entityType)}&entityId=${entityId}`,
      ),
    enabled: !!companySlug && !!entityType && entityId > 0,
  });
}

/**
 * Create a memory note scoped to a specific entity.
 *
 * On success the entity memory notes query is invalidated so
 * the new note appears in the list.
 */
interface CreateEntityMemoryNotePayload {
  companySlug: string;
  entityType: string;
  entityId: number;
  note: string;
}

export function useCreateEntityMemoryNote() {
  const queryClient = useQueryClient();

  return useMutation<EntityMemoryNote, ApiError, CreateEntityMemoryNotePayload>({
    mutationFn: (payload) =>
      apiPost<CreateEntityMemoryNotePayload, EntityMemoryNote>("/api/ai/memory", payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.ai.all, "entity-memory", variables.companySlug, variables.entityType, variables.entityId],
      });
    },
  });
}

// ─── AI Agent Messaging Hook ─────────────────────────────────────────────────

/** Payload for sending a message to a specific AI agent. */
interface AgentMessagePayload {
  agentType: string;
  message: string;
  companySlug: string;
}

/** Response from an AI agent message. */
interface AgentMessageResponse {
  ok: boolean;
  inScope: boolean;
  agentName: string;
  response: string;
  allowedIntents?: string[];
}

/**
 * Send a message to a specific AI agent (accounting / sales / inventory).
 *
 * This is a fire-and-forget style mutation — it returns the agent's
 * response directly. Callers manage chat state locally.
 */
export function useAIAgentMessage() {
  return useMutation<AgentMessageResponse, ApiError, AgentMessagePayload>({
    mutationFn: (payload) =>
      apiPost<AgentMessagePayload, AgentMessageResponse>("/api/ai/agents", payload),
  });
}

// ─── AI Tools Hooks ──────────────────────────────────────────────────────────

/** Response from listing available AI tools. */
interface AIToolsResponse {
  tools: Array<{
    intent: string;
    description: string;
    parameters: Array<Record<string, unknown>>;
  }>;
}

/**
 * Fetch the list of available AI tools/intents.
 *
 * @param companySlug - Slug of the company whose tools to list.
 */
export function useAITools(companySlug: string) {
  return useQuery<AIToolsResponse, ApiError>({
    queryKey: [...queryKeys.ai.all, "tools", companySlug] as const,
    queryFn: () =>
      apiGet<AIToolsResponse>(
        `/api/ai/tools?companySlug=${encodeURIComponent(companySlug)}`,
      ),
    enabled: !!companySlug,
  });
}

/** Payload for executing/confirming an AI tool action. */
interface AIToolsExecutePayload {
  intent: string;
  params: Record<string, unknown>;
  confirmToken?: string;
  companySlug: string;
}

/** Response from executing an AI tool. */
interface AIToolsExecuteResponse {
  ok: boolean;
  result?: Record<string, unknown>;
  preview?: string;
  confirmToken?: string;
  warning?: string;
  affectedRecords?: Array<{ type: string; id?: string | number; name?: string }>;
}

/**
 * Execute or confirm an AI tool action.
 *
 * This is a fire-and-forget style mutation — it returns the tool's
 * result directly. Callers manage chat/confirmation state locally.
 */
export function useAIToolsExecute() {
  return useMutation<AIToolsExecuteResponse, ApiError, AIToolsExecutePayload>({
    mutationFn: (payload) =>
      apiPost<AIToolsExecutePayload, AIToolsExecuteResponse>("/api/ai/tools", payload),
  });
}

// ─── AI Chat History Hook ───────────────────────────────────────────────────

/** Shape of a chat message in history. */
export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
  conversationId?: string;
  [key: string]: unknown;
}

/** Response shape for the AI chat history endpoint. */
interface ChatHistoryResponse {
  messages: ChatHistoryMessage[];
}

/**
 * Fetch AI chat history for a given company.
 *
 * Returns prior conversation messages so the caller can restore
 * a previous chat session.
 *
 * @param companySlug - Optional slug of the company to scope the history.
 */
export function useAIChatHistory(companySlug?: string) {
  return useQuery<ChatHistoryResponse, ApiError>({
    queryKey: queryKeys.ai.chatHistory(companySlug),
    queryFn: () => {
      const params = new URLSearchParams();
      if (companySlug) params.set("companySlug", companySlug);
      const url = params.toString() ? `/api/ai/chat?${params.toString()}` : "/api/ai/chat";
      return apiGet<ChatHistoryResponse>(url);
    },
    enabled: !!companySlug || true, // always enabled; companySlug is optional
    staleTime: 0, // always fresh — chat history can change quickly
  });
}

// ─── AI Chat Messages Hook ──────────────────────────────────────────────────

/** Payload for sending a conversation-style message to the AI chat endpoint. */
export interface AIChatMessagesPayload {
  messages: Array<{ role: string; content: string }>;
  companySlug?: string;
  conversationId?: string;
  [key: string]: unknown;
}

/** Response shape for the conversation-style chat endpoint. */
interface AIChatMessagesResponse {
  reply: string;
  conversationId?: string;
  [key: string]: unknown;
}

/**
 * Send a conversation-style message to the AI chat endpoint.
 *
 * Unlike `useAIChat` (which sends a single message), this hook sends
 * an array of recent messages for multi-turn conversation context.
 * This is a fire-and-forget style mutation — it returns the AI's
 * reply directly. Callers manage chat state locally.
 */
export function useAIChatMessages() {
  return useMutation<AIChatMessagesResponse, ApiError, AIChatMessagesPayload>({
    mutationFn: (payload) =>
      apiPost<AIChatMessagesPayload, AIChatMessagesResponse>("/api/ai/chat", payload),
  });
}

// ─── Parse Image JSON Hook ──────────────────────────────────────────────────

/** Payload for parsing an image via JSON (base64-encoded). */
export interface ParseImageJsonPayload {
  imageBase64: string;
  mimeType?: string;
  companySlug: string;
  autoAddProducts?: boolean;
  [key: string]: unknown;
}

/**
 * Parse an image using the AI service via JSON payload (base64-encoded).
 *
 * Unlike `useParseImage` (which uses FormData upload), this hook sends
 * a JSON body with a base64-encoded image string. This is useful when
 * the image data is already available in base64 format (e.g. from
 * a FileReader).
 *
 * This is a fire-and-forget style mutation — it does not invalidate
 * any query caches automatically.
 */
export function useParseImageJson() {
  return useMutation<Record<string, unknown>, ApiError, ParseImageJsonPayload>({
    mutationFn: (payload) =>
      apiPost<ParseImageJsonPayload, Record<string, unknown>>("/api/ai/parse-image", payload),
  });
}

// ─── Parse File JSON Hook ───────────────────────────────────────────────────

/** Payload for parsing a file via JSON (base64-encoded). */
export interface ParseFileJsonPayload {
  fileBase64: string;
  fileName: string;
  companySlug: string;
  [key: string]: unknown;
}

/**
 * Parse a file using the AI service via JSON payload (base64-encoded).
 *
 * Unlike `useParseFile` (which uses FormData upload), this hook sends
 * a JSON body with a base64-encoded file string. This is useful when
 * the file data is already available in base64 format.
 *
 * This is a fire-and-forget style mutation — it does not invalidate
 * any query caches automatically.
 */
export function useParseFileJson() {
  return useMutation<Record<string, unknown>, ApiError, ParseFileJsonPayload>({
    mutationFn: (payload) =>
      apiPost<ParseFileJsonPayload, Record<string, unknown>>("/api/ai/parse-file", payload),
  });
}
