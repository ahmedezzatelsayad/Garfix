/**
 * ssrf.ts — Shared SSRF (Server-Side Request Forgery) validation + safe fetch.
 *
 * Used by:
 *   - src/lib/webhooks.ts (tenant-registered webhook URLs)
 *   - src/lib/integrations/myfatoorah.ts (payment provider base_url)
 *   - src/lib/integrations/paymob.ts (payment provider base_url)
 *   - src/lib/aiProvider.ts (AI provider base_url)
 *   - src/app/api/platform-admin/ai-providers/route.ts (at save time)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DNS REBINDING PROTECTION (P1-1 fix):
 *
 * `validateBaseUrl()` alone is insufficient. An attacker can register a
 * hostname that resolves to a PUBLIC IP at validation time (passing the
 * check) and to a PRIVATE IP at fetch time (bypassing it). This is the
 * classic DNS-rebinding SSRF pattern.
 *
 * `fetchSafe()` resolves the hostname ONCE, validates EVERY resolved IP
 * against the private-range rules, then makes the fetch with a Host header
 * that preserves the original hostname (so the upstream TLS cert still
 * validates). This pins the DNS result for the duration of the request.
 *
 * Caveat: TOCTOU race window — between `dns.lookup()` and `fetch()`, the
 * resolver cache could theoretically be poisoned. Node's `dns.lookup` uses
 * the OS resolver (getaddrinfo) which caches at the OS level. This is
 * acceptable given the threat model — the goal is to make the trivial
 * DNS-rebinding attack (TTL=0 records) impossible, not to defend against
 * a nation-state adversary with OS-level compromise.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { lookup as dnsLookup } from "node:dns/promises";
import { networkInterfaces } from "node:os";

/**
 * Validate that a URL is safe to fetch server-side.
 * Throws an Error with an Arabic message if the URL is unsafe.
 *
 * Rules:
 *   1. Must parse as a valid URL
 *   2. Must use HTTPS ( Exceptions: none — production must use HTTPS )
 *   3. Hostname must not be in the blocked-hosts list (localhost, loopback,
 *      link-local, cloud-metadata endpoints)
 *   4. Hostname must not be a private IPv4 range (10.x, 127.x, 172.16-31.x,
 *      192.168.x, 169.254.x, 0.x)
 *   5. Hostname must not be an IPv6 loopback / link-local / ULA
 *      (::1, fe80::/10, fc00::/7, ::ffff:127.0.0.1)
 *   6. Hostname must not be a bare hostname (no dot) or end with an internal
 *      TLD (.internal, .local, .localhost, .intra, .corp)
 */
export function validateBaseUrl(url: string, opts: { allowHttp?: boolean } = {}): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("عنوان URL غير صالح");
  }
  if (!opts.allowHttp && parsed.protocol !== "https:") {
    throw new Error("يجب أن يستخدم البروتوكول HTTPS فقط");
  }
  if (opts.allowHttp && parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("يجب أن يستخدم البروتوكول HTTP أو HTTPS فقط");
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Block known metadata / loopback / link-local hostnames
  const blockedHosts = new Set([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
    "169.254.169.254", // AWS / GCP / Azure cloud metadata endpoint
    "169.254.170.2",   // ECS task metadata
    "169.254.169.253", // AWS VPC DNS (sometimes used for SSRF)
    "metadata.google.internal", // GCP metadata
    "metadata.azure.com", // Azure metadata
  ]);
  if (blockedHosts.has(host)) {
    throw new Error("يُمنع استخدام عناوين داخلية أو محلية");
  }

  // Block private/loopback/link-local IPv4 ranges
  const ipv4Match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const a = parseInt(ipv4Match[1], 10);
    const b = parseInt(ipv4Match[2], 10);
    if (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    ) {
      throw new Error("يُمنع استخدام عناوين IP خاصة أو داخلية");
    }
  }

  // Block IPv6 loopback / link-local / unique-local / v4-mapped
  if (host.includes(":")) {
    const v6 = host.replace(/^\[|\]$/g, "");
    if (
      v6 === "::1" ||
      /^fe[89ab][0-9a-f]:/i.test(v6) ||
      /^f[cd][0-9a-f]{2}:/i.test(v6) ||
      /^::ffff:127\./i.test(v6) ||
      /^::ffff:10\./i.test(v6) ||
      /^::ffff:192\.168\./i.test(v6)
    ) {
      throw new Error("يُمنع استخدام عناوين IPv6 داخلية");
    }
  }

  // Block obvious internal hostnames (no dot, or ends with internal TLD)
  if (!host.includes(".") || /\.(internal|local|localhost|intra|corp)$/i.test(host)) {
    throw new Error("يبدو أن العنوان يشير إلى مضيف داخلي — يُسمح فقط بعناوين الإنترنت العامة");
  }
}

/**
 * Soft check — returns true if the URL is safe, false otherwise.
 */
export function isSafeUrl(url: string, opts?: { allowHttp?: boolean }): boolean {
  try {
    validateBaseUrl(url, opts);
    return true;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// IP-range validation (used by fetchSafe after DNS resolution)
// ──────────────────────────────────────────────────────────────────────────

/** Set of all local-network IPv4 CIDRs that we refuse to fetch from. */
const PRIVATE_IPV4_PREFIXES: ReadonlyArray<{ first: number; mask: number }> = [
  // 0.0.0.0/8          — "this host" range
  { first: 0x00000000, mask: 0xff000000 },
  // 10.0.0.0/8         — private class A
  { first: 0x0a000000, mask: 0xff000000 },
  // 100.64.0.0/10      — CGNAT shared address space
  { first: 0x64400000, mask: 0xffc00000 },
  // 127.0.0.0/8        — loopback
  { first: 0x7f000000, mask: 0xff000000 },
  // 169.254.0.0/16     — link-local
  { first: 0xa9fe0000, mask: 0xffff0000 },
  // 172.16.0.0/12      — private class B
  { first: 0xac100000, mask: 0xfff00000 },
  // 192.0.2.0/24       — TEST-NET-1 (documentation)
  { first: 0xc0000200, mask: 0xffffff00 },
  // 192.168.0.0/16     — private class C
  { first: 0xc0a80000, mask: 0xffff0000 },
  // 198.18.0.0/15      — benchmark testing
  { first: 0xc6120000, mask: 0xfffe0000 },
  // 198.51.100.0/24    — TEST-NET-2
  { first: 0xc6336400, mask: 0xffffff00 },
  // 203.0.113.0/24     — TEST-NET-3
  { first: 0xcb007100, mask: 0xffffff00 },
  // 224.0.0.0/4        — multicast
  { first: 0xe0000000, mask: 0xf0000000 },
  // 240.0.0.0/4        — reserved
  { first: 0xf0000000, mask: 0xf0000000 },
];

/** Parse dotted-quad IPv4 to 32-bit unsigned int. Returns null on parse error. */
function ipv4ToUint32(s: string): number | null {
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const parts = [m[1], m[2], m[3], m[4]].map(Number);
  if (parts.some((p) => p < 0 || p > 255 || !Number.isFinite(p))) return null;
  // eslint-disable-next-line no-bitwise
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** Returns true if the IPv4 address falls in any private/reserved range. */
function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToUint32(ip);
  if (n === null) return false; // not an IPv4 → don't claim it's private
  // eslint-disable-next-line no-bitwise
  return PRIVATE_IPV4_PREFIXES.some(({ first, mask }) => (n & mask) >>> 0 === first);
}

/** Returns true if the IPv6 address is loopback / link-local / ULA / v4-mapped-private. */
function isPrivateIPv6(ip: string): boolean {
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v6 === "::1") return true; // loopback
  if (/^fe[89ab][0-9a-f]:/.test(v6)) return true; // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true; // ULA fc00::/7
  if (/^::ffff:127\./.test(v6) || /^::ffff:10\./.test(v6) || /^::ffff:192\.168\./.test(v6)) return true;
  return false;
}

/** Returns true if the IP string is private / loopback / link-local / reserved. */
function isPrivateIP(ip: string): boolean {
  return ip.includes(":") ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

/**
 * On startup, compute the set of local IP addresses assigned to this machine.
 * Used to block fetches that would otherwise target the host itself (e.g. an
 * attacker who registered a public hostname pointing at the Vercel function's
 * own private IP).
 *
 * Cached as a module-level constant — interface list doesn't change at runtime.
 */
const LOCAL_MACHINE_IPS: ReadonlySet<string> = (() => {
  const ips = new Set<string>();
  try {
    for (const ifaces of Object.values(networkInterfaces())) {
      if (!ifaces) continue;
      for (const iface of ifaces) {
        if (!iface) continue;
        ips.add(iface.address);
      }
    }
  } catch {
    // Network interfaces unavailable (e.g. in some sandboxed runtimes) — skip.
  }
  return ips;
})();

// ──────────────────────────────────────────────────────────────────────────
// fetchSafe — SSRF-protected fetch with DNS pinning
// ──────────────────────────────────────────────────────────────────────────

/**
 * Safe fetch wrapper that defends against DNS rebinding.
 *
 * 1. Validates the URL syntactically + hostname range (same as validateBaseUrl).
 * 2. Resolves the hostname via `dns.lookup()` (one DNS query).
 * 3. Validates EVERY resolved IP against private/loopback/link-local ranges.
 *    If ANY resolved IP is private → throw.
 * 4. Reconstructs the URL with the resolved IP as the host, but sets the
 *    `Host` header to the ORIGINAL hostname (so TLS SNI + cert validation
 *    still work against the original domain).
 *
 * For IPv6 literals we wrap them in [] when building the URL.
 *
 * Trade-off: this adds one DNS lookup latency (~1-5ms) per fetch, but only
 * the first lookup per hostname per TTL window is slow (OS resolver caches).
 *
 * Node-only: uses `node:dns/promises`. All callers (webhooks, myfatoorah,
 * paymob, aiProvider) run in Route Handlers (Node runtime), so this is fine.
 */
export async function fetchSafe(
  url: string | URL,
  init: RequestInit = {},
  opts: { allowHttp?: boolean } = {},
): Promise<Response> {
  const urlStr = typeof url === "string" ? url : url.toString();
  validateBaseUrl(urlStr, opts);

  const parsed = new URL(urlStr);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

  // ── DNS pinning ───────────────────────────────────────────────────────
  // Skip DNS resolution if the hostname is already a literal IP — in that
  // case validateBaseUrl already validated its range.
  const isLiteralIP = /^(\d+\.){3}\d+$/.test(hostname) || hostname.includes(":");
  let resolvedIP: string | null = null;
  if (!isLiteralIP) {
    let lookupResult: { address: string; family: number }[];
    try {
      lookupResult = await dnsLookup(hostname, { all: true, family: 0 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`DNS lookup failed for ${hostname}: ${msg}`);
    }
    if (!lookupResult.length) {
      throw new Error(`DNS lookup returned no records for ${hostname}`);
    }
    // Validate EVERY resolved address — if any are private, refuse the fetch.
    // An attacker with multiple A records (one safe, one private) must not
    // be able to slip past via a lucky connect() attempt.
    for (const rec of lookupResult) {
      if (isPrivateIP(rec.address)) {
        throw new Error(
          `DNS resolution of ${hostname} returned a private/internal IP (${rec.address}) — ` +
          `possible DNS-rebinding attack, refusing to fetch`,
        );
      }
      if (LOCAL_MACHINE_IPS.has(rec.address)) {
        throw new Error(
          `DNS resolution of ${hostname} returned this machine's own IP (${rec.address}) — ` +
          `refusing to fetch self`,
        );
      }
    }
    // Use the first resolved address (Node's getaddrinfo already orders by
    // RFC 6724 preference, so this is the same IP that an unprotected fetch
    // would have likely used — but now we've verified it's safe).
    resolvedIP = lookupResult[0].address;
  }

  // ── Build the pinned URL ──────────────────────────────────────────────
  // Replace hostname with the resolved IP, preserving port/path/query.
  // For IPv6 literals, wrap in brackets per RFC 3986.
  let pinnedUrl: string;
  if (resolvedIP) {
    const ipHost = resolvedIP.includes(":") ? `[${resolvedIP}]` : resolvedIP;
    const portPart = parsed.port ? `:${parsed.port}` : "";
    pinnedUrl = `${parsed.protocol}//${ipHost}${portPart}${parsed.pathname}${parsed.search}`;
  } else {
    pinnedUrl = urlStr;
  }

  // ── Issue the fetch with original Host header ─────────────────────────
  // Without an explicit Host header, the fetch would send `Host: <ip>` and
  // TLS SNI would also use the IP — causing cert validation to fail for
  // HTTPS URLs that use domain-based certs. Setting Host: <original-hostname>
  // makes the upstream serve the correct vhost + cert.
  //
  // Also set `servername` via `dispatcher` is not possible from fetch() —
  // but undici (Node's fetch) respects the `Host` header for SNI.
  const headers = new Headers(init.headers || undefined);
  if (resolvedIP && !headers.has("Host")) {
    // Include port in Host header only if non-default for the protocol.
    const isDefaultPort =
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80");
    const hostHeader = isDefaultPort || !parsed.port
      ? hostname
      : `${hostname}:${parsed.port}`;
    headers.set("Host", hostHeader);
  }

  return fetch(pinnedUrl, { ...init, headers });
}

// ──────────────────────────────────────────────────────────────────────────
// Test-only exports (used by unit tests in __tests__/ssrf.test.ts)
// ──────────────────────────────────────────────────────────────────────────
export const __test = {
  isPrivateIPv4,
  isPrivateIPv6,
  isPrivateIP,
  ipv4ToUint32,
  PRIVATE_IPV4_PREFIXES,
  LOCAL_MACHINE_IPS,
};
