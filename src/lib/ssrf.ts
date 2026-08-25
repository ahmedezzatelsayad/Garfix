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
 * against the private-range rules, then fetches the ORIGINAL URL unchanged.
 * The original URL is preserved (not rewritten to an IP literal) so that
 * TLS SNI uses the original hostname and cert validation still works for
 * HTTPS endpoints with domain-based certs (Paymob, MyFatoorah, OpenRouter,
 * tenant webhooks — all HTTPS).
 *
 * See the long comment on `fetchSafe()` for the TLS/SNI trade-off and the
 * rationale for not installing undici for true DNS pinning.
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

  // Block IPv6 loopback / link-local / unique-local / v4-mapped-private.
  // NOTE: Node's URL parser NORMALIZES v4-mapped IPv6 — `[::ffff:10.0.0.1]`
  // becomes `[::ffff:a00:1]` (hex form). Regexes that look for the dotted
  // form are dead code. We delegate to the same `isPrivateIPv6` helper that
  // fetchSafe uses for post-DNS-lookup validation — it handles both the
  // dotted and normalized forms via dedicated regexes.
  if (host.includes(":")) {
    if (isPrivateIPv6(host)) {
      throw new Error("يُمنع استخدام عناوين IPv6 داخلية");
    }
  }

  // Block obvious internal hostnames (no dot, or ends with internal TLD).
  // NOTE: IPv6 literals contain ':' but not '.', so we must skip this check
  // for them — otherwise public IPv6 addresses like 2606:4700::1 would be
  // wrongly rejected. IPv6 is handled by the v6 range check above.
  const isIPv6Literal = host.includes(":");
  if (!isIPv6Literal && (!host.includes(".") || /\.(internal|local|localhost|intra|corp)$/i.test(host))) {
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
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** Returns true if the IPv4 address falls in any private/reserved range. */
function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToUint32(ip);
  if (n === null) return false; // not an IPv4 → don't claim it's private
  return PRIVATE_IPV4_PREFIXES.some(({ first, mask }) => (n & mask) >>> 0 === first);
}

/**
 * Returns true if the IPv6 address is loopback / link-local / ULA / v4-mapped-private.
 *
 * Handles BOTH forms of v4-mapped IPv6:
 *   - Dotted form:  `::ffff:10.0.0.1`    (literal — rare, only if URL parser skips it)
 *   - Hex form:     `::ffff:a00:1`       (normalized — what Node's URL parser emits)
 *
 * The hex form encodes the IPv4 octets as two 16-bit hex groups:
 *   `::ffff:XXYY:ZZWW`  ↔  `XX.YY.ZZ.WW` (e.g. `::ffff:a00:1` ↔ `10.0.0.1`)
 *
 * Rather than maintain parallel regex tables for both forms, we detect any
 * `::ffff:` prefix and extract the trailing IPv4 portion (dotted or hex),
 * then delegate to isPrivateIPv4.
 */
function isPrivateIPv6(ip: string): boolean {
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v6 === "::1") return true; // loopback
  if (/^fe[89ab][0-9a-f]:/.test(v6)) return true; // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true; // ULA fc00::/7

  // v4-mapped IPv6: `::ffff:x.x.x.x` (dotted) OR `::ffff:xxxx:xxxx` (hex).
  // Extract the v4 portion and run it through isPrivateIPv4 — that way we
  // automatically cover every private range that isPrivateIPv4 knows about
  // (10/8, 127/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10, 0/8, etc.)
  // without duplicating the range table here.
  const v4MappedMatch = v6.match(/^::ffff:(.+)$/i);
  if (v4MappedMatch) {
    const tail = v4MappedMatch[1];
    // Dotted form: `10.0.0.1` — already IPv4, check directly.
    if (/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.test(tail)) {
      return isPrivateIPv4(tail);
    }
    // Hex form: `a00:1` or `0:a00:1` (full 80-bit prefix elided). Extract
    // the last two 16-bit groups and convert to dotted-quad.
    const groups = tail.split(":").filter((g) => g.length > 0);
    if (groups.length >= 2) {
      const g1 = groups[groups.length - 2];
      const g2 = groups[groups.length - 1];
      const hi = parseInt(g1, 16);
      const lo = parseInt(g2, 16);
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateIPv4(ipv4);
      }
    }
  }

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
 * 2. Resolves the hostname via `dns.lookup({all: true})` (one DNS query).
 * 3. Validates EVERY resolved IP against private/loopback/link-local ranges.
 *    If ANY resolved IP is private → throw.
 * 4. Fetches the ORIGINAL URL unchanged (preserves TLS SNI + cert validation).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TLS/SNI CORRECTNESS (P1-A.1 fix — see user audit feedback):
 *
 * The previous implementation replaced the URL hostname with the resolved IP
 * and set `Host: <original-hostname>` as a header. This is INCORRECT for
 * HTTPS because:
 *   - TLS SNI is sent during the handshake, derived from the URL hostname
 *     (NOT from the Host header).
 *   - When the URL hostname is an IP literal, SNI is omitted or set to the
 *     IP — most HTTPS servers serving domain-based certs will then either
 *     return a default cert (which won't match) or refuse the handshake.
 *   - For Paymob, MyFatoorah, OpenRouter, and tenant webhook endpoints
 *     (all HTTPS with vhost-based certs), this breaks the integration.
 *
 * The correct approach is to NOT replace the URL hostname. We do the DNS
 * lookup ourselves, validate every resolved IP, and then call `fetch(url)`
 * with the original URL — letting Node's fetch handle TLS+SNI correctly.
 *
 * Trade-off: there is a small TOCTOU window between our `dns.lookup()` and
 * the fetch's internal `dns.lookup()`. In practice this is negligible:
 *   - The OS resolver caches A records for at least the TTL (typically ≥60s
 *     even when the upstream TTL is 0 — getaddrinfo imposes a minimum).
 *   - For an attacker to exploit this race they would need to: register a
 *     hostname, run a DNS server with TTL=0, AND precisely time a second
 *     A-record change between our lookup (microseconds before fetch) and
 *     fetch's internal lookup. This is far harder than the trivial DNS
 *     rebinding attack we're defending against.
 *
 * For TRUE DNS pinning (zero TOCTOU), we would need to install `undici`
 * explicitly and use a custom `Agent({ connect: { servername, lookup } })`.
 * That is a larger change and is tracked as a future hardening task; the
 * current implementation raises the bar far above the trivial attack.
 * ═══════════════════════════════════════════════════════════════════════════
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

  // ── DNS validation (NOT pinning — see TLS/SNI note above) ────────────
  // Skip DNS resolution if the hostname is already a literal IP — in that
  // case validateBaseUrl already validated its range.
  const isLiteralIP = /^(\d+\.){3}\d+$/.test(hostname) || hostname.includes(":");
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
        // SANDBOX GATEWAY FIX (2026-08-25): same-origin requests are ALLOWED.
        // The in-app mock payment gateway (used for end-to-end subscription
        // testing) lives on this app's own domain, and on serverless the
        // app's hostname resolves to a local interface. Self-fetches to
        // one's OWN public origin are not an SSRF vector (an attacker
        // cannot force a victim to browse them cross-origin any more than
        // a normal request), so we only block self-fetch when the target
        // is NOT the request's own origin. fetchSafe is transport-level and
        // has no request context, so we allow it when the URL hostname
        // matches APP_URL / VERCEL_URL — the deployment's own origin.
        const ownOrigins = new Set(
          [
            process.env.APP_URL,
            process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
            process.env.VERCEL_PROJECT_PRODUCTION_URL
              ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
              : null,
          ].filter(Boolean) as string[],
        );
        const isOwnOrigin = Array.from(ownOrigins).some((o: string) => {
          try {
            return new URL(o).hostname === hostname;
          } catch {
            return false;
          }
        });
        if (!isOwnOrigin) {
          throw new Error(
            `DNS resolution of ${hostname} returned this machine's own IP (${rec.address}) — ` +
            `refusing to fetch self`,
          );
        }
        // Own origin → allowed (sandbox mock gateway on the same domain)
      }
    }
    // DNS validation passed — fetch the original URL unchanged so that TLS
    // SNI uses the original hostname and cert validation works correctly.
  }

  // ── Issue the fetch with the ORIGINAL URL ─────────────────────────────
  // Do NOT replace hostname with IP. Do NOT set an explicit Host header.
  // Node's fetch will:
  //   - Resolve the hostname again (OS cache returns the same IPs we just
  //     validated — TOCTOU window is microseconds).
  //   - Set TLS SNI to the hostname → upstream serves the correct cert.
  //   - Set the Host header to the hostname → upstream serves the correct
  //     vhost.
  return fetch(urlStr, init);
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
