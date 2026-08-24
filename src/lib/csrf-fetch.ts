/**
 * csrf-fetch.ts — standalone CSRF-aware fetch for client components.
 *
 * SECURITY FIX (Review C4 / 2026-08-24): ~20 call sites across the app
 * (founder-panel pages, invoice/product dialogs, e-invoicing submit buttons,
 * the GarfiX AI copilot, the useGarfiXAI hooks…) issued raw `fetch()` calls
 * WITHOUT the X-CSRF-Token header. The middleware double-submit check
 * rejected every one of them with 403, silently killing those features in
 * production (including adding DeepSeek keys from the founder panel).
 *
 * This helper is self-contained (no React context needed) so any client
 * component can import it:
 *   - reads the non-httpOnly `inv_csrf` cookie
 *   - attaches it as `X-CSRF-Token` on POST/PUT/PATCH/DELETE
 *   - 30s default timeout via AbortController
 *   - single 401 → refresh → retry cycle
 *
 * Prefer `apiPost/apiPatch/apiPut/apiDelete` from `@/hooks/api-client` for
 * fully-typed calls with circuit breakers; use `csrfFetch` when you need the
 * raw Response object (streams, blobs, status codes).
 */

const CSRF_COOKIE = "inv_csrf";
const MUTATING = ["POST", "PUT", "PATCH", "DELETE"];
const DEFAULT_TIMEOUT_MS = 30_000;

function readCsrfCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : undefined;
}

function isAbortErr(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

async function csrfFetchInner(url: string, opts: RequestInit, timeoutMs: number): Promise<Response> {
  const method = (opts.method || "GET").toUpperCase();
  const headers = new Headers(opts.headers || undefined);
  if (MUTATING.includes(method)) {
    const csrf = readCsrfCookie();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // respect an externally-provided signal too
  const externalSignal = opts.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    return await fetch(url, {
      ...opts,
      headers,
      credentials: "include",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * CSRF-aware fetch with timeout + one automatic refresh-retry on 401.
 * Signature-compatible with the standard fetch() for easy migration of
 * broken raw-fetch call sites.
 */
export async function csrfFetch(url: string, opts: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  let res: Response;
  try {
    res = await csrfFetchInner(url, opts, timeoutMs);
  } catch (err) {
    if (isAbortErr(err)) {
      throw new DOMException("انتهت مهلة الطلب. حاول مرة أخرى.", "TimeoutError");
    }
    throw err;
  }
  if (res.status !== 401) return res;

  // One refresh attempt, then replay the original request once.
  try {
    const refreshRes = await csrfFetchInner(
      "/api/auth/refresh",
      { method: "POST", credentials: "include" },
      10_000,
    );
    if (!refreshRes.ok) return res;
  } catch {
    return res; // refresh failed — surface the original 401
  }
  try {
    return await csrfFetchInner(url, opts, timeoutMs);
  } catch (err) {
    if (isAbortErr(err)) {
      throw new DOMException("انتهت مهلة الطلب. حاول مرة أخرى.", "TimeoutError");
    }
    throw err;
  }
}

/** Convenience wrapper: JSON body + CSRF + parse response as JSON. */
export async function csrfJson<T = unknown>(
  url: string,
  opts: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: boolean; status: number; body: T | null }> {
  const res = await csrfFetch(url, opts, timeoutMs);
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}
