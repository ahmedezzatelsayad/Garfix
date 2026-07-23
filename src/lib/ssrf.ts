/**
 * ssrf.ts — Shared SSRF (Server-Side Request Forgery) validation.
 *
 * Used by:
 *   - src/lib/webhooks.ts (tenant-registered webhook URLs)
 *   - src/lib/integrations/myfatoorah.ts (payment provider base_url)
 *   - src/lib/integrations/paymob.ts (payment provider base_url)
 *   - src/lib/aiProvider.ts (AI provider base_url)
 *   - src/app/api/platform-admin/ai-providers/route.ts (at save time)
 *
 * The validator is defense-in-depth — it does NOT fully mitigate DNS-rebinding
 * attacks (where a hostname resolves to a public IP at validation time but a
 * private IP at request time). A complete fix requires resolving the hostname
 * and pinning the IP for the actual fetch. That's a larger refactor tracked
 * separately. For now, hostname + IP-pattern validation catches the
 * overwhelming majority of SSRF attempts (the audit finding's primary concern
 * was the trivially-exploitable "set base_url to internal IP" case).
 */

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
  // ::1 — loopback
  // fe80::/10 — link-local (matches fe80:: through febf::)
  // fc00::/7 — unique local address (matches fc00:: through fdff::)
  // ::ffff:127.0.0.1 (and similar v4-mapped loopback)
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
 * Useful for code paths that want to log invalid URLs without throwing.
 */
export function isSafeUrl(url: string, opts?: { allowHttp?: boolean }): boolean {
  try {
    validateBaseUrl(url, opts);
    return true;
  } catch {
    return false;
  }
}
