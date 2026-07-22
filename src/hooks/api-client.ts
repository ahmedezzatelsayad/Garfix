/**
 * api-client — Type-safe HTTP client for React Query hooks.
 *
 * Wraps `authedFetch` with JSON parsing, error handling, and typed responses.
 * All React Query queryFn and mutationFn functions should use these helpers
 * instead of raw `authedFetch` to ensure consistent error handling and typing.
 */
"use client";

import { authedFetch } from "@/context/AuthContext";

// ─── Error class ───────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(
      (body?.error as string) || `API Error ${status}`,
    );
    this.name = "ApiError";
  }
}

// ─── Core fetch helpers ────────────────────────────────────────────────────

/** Typed GET request — parses JSON, throws ApiError on non-ok responses. */
export async function apiGet<T>(url: string): Promise<T> {
  const res = await authedFetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new ApiError(res.status, body as Record<string, unknown>);
  }
  return res.json() as Promise<T>;
}

/** Typed POST request. */
export async function apiPost<TReq, TRes = void>(
  url: string,
  body?: TReq,
): Promise<TRes> {
  const res = await authedFetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: "Request failed" }));
    throw new ApiError(res.status, errBody as Record<string, unknown>);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as TRes;
  }
  return res.json() as Promise<TRes>;
}

/** Typed PATCH request. */
export async function apiPatch<TReq, TRes = void>(
  url: string,
  body: TReq,
): Promise<TRes> {
  const res = await authedFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: "Request failed" }));
    throw new ApiError(res.status, errBody as Record<string, unknown>);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as TRes;
  }
  return res.json() as Promise<TRes>;
}

/** Typed PUT request. */
export async function apiPut<TReq, TRes = void>(
  url: string,
  body: TReq,
): Promise<TRes> {
  const res = await authedFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: "Request failed" }));
    throw new ApiError(res.status, errBody as Record<string, unknown>);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as TRes;
  }
  return res.json() as Promise<TRes>;
}

/** Typed DELETE request. */
export async function apiDelete<TRes = void>(url: string): Promise<TRes> {
  const res = await authedFetch(url, { method: "DELETE" });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: "Request failed" }));
    throw new ApiError(res.status, errBody as Record<string, unknown>);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as TRes;
  }
  return res.json() as Promise<TRes>;
}

// ─── File upload helper ────────────────────────────────────────────────────

/** Upload a file via POST with multipart/form-data. */
export async function apiUpload<TRes>(
  url: string,
  formData: FormData,
): Promise<TRes> {
  const res = await authedFetch(url, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new ApiError(res.status, errBody as Record<string, unknown>);
  }
  return res.json() as Promise<TRes>;
}
