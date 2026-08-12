/**
 * ssrf.test.ts — Verification suite for SSRF protection (P1-A).
 *
 * Covers:
 *   1. validateBaseUrl() — syntactic + hostname-range checks
 *   2. isPrivateIPv4() — every RFC 1918 + reserved range
 *   3. isPrivateIPv6() — loopback / link-local / ULA / v4-mapped-private
 *   4. fetchSafe() — DNS rebinding defense (mocked dns.lookup)
 *   5. fetchSafe() — TLS/SNI correctness (verifies original URL is fetched)
 *
 * The goal of this suite is to be the "Verification Gate" defined in the
 * user's hardening plan: no P1-A fix is considered complete until ALL these
 * tests pass.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// ── Mock the `node:dns/promises` lookup BEFORE importing fetchSafe ──────
// We use mock.module to replace dnsLookup with a controllable stub so we
// can simulate DNS rebinding (returning public IP for one call, private
// IP for the next) without hitting the real network.

type LookupRecord = { address: string; family: number };
type LookupFn = (
  hostname: string,
  opts?: { all?: boolean; family?: number },
) => Promise<LookupRecord[] | LookupRecord>;

let mockLookupImpl: LookupFn;

mock.module("node:dns/promises", () => ({
  lookup: (hostname: string, opts?: { all?: boolean; family?: number }) =>
    mockLookupImpl(hostname, opts),
}));

// Mock global fetch — we never want tests to hit the network.
const mockFetch = mock(() =>
  Promise.resolve(
    new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }),
  ),
);

// Replace global fetch with our mock before any test runs.
(globalThis as  { fetch: typeof fetch }).fetch = mockFetch as  typeof fetch;

// Now safe to import the module under test.
const {
  validateBaseUrl,
  isSafeUrl,
  fetchSafe,
  __test,
} = require("../ssrf") as {
  validateBaseUrl: (url: string, opts?: { allowHttp?: boolean }) => void;
  isSafeUrl: (url: string, opts?: { allowHttp?: boolean }) => boolean;
  fetchSafe: (
    url: string | URL,
    init?: RequestInit,
    opts?: { allowHttp?: boolean },
  ) => Promise<Response>;
  __test: {
    isPrivateIPv4: (ip: string) => boolean;
    isPrivateIPv6: (ip: string) => boolean;
    isPrivateIP: (ip: string) => boolean;
    ipv4ToUint32: (s: string) => number | null;
    PRIVATE_IPV4_PREFIXES: ReadonlyArray<{ first: number; mask: number }>;
    LOCAL_MACHINE_IPS: ReadonlySet<string>;
  };
};

const {
  isPrivateIPv4,
  isPrivateIPv6,
  isPrivateIP,
  ipv4ToUint32,
  PRIVATE_IPV4_PREFIXES,
} = __test;

beforeEach(() => {
  mockLookupImpl = async () => [{ address: "93.184.216.34", family: 4 }]; // example.com
  mockFetch.mockClear();
});

afterEach(() => {
  mockLookupImpl = async () => [{ address: "93.184.216.34", family: 4 }];
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. validateBaseUrl — syntactic + hostname-range checks
// ═══════════════════════════════════════════════════════════════════════════

describe("validateBaseUrl — syntactic checks", () => {
  it("rejects non-URL strings", () => {
    expect(() => validateBaseUrl("not a url")).toThrow();
    expect(() => validateBaseUrl("")).toThrow();
    expect(() => validateBaseUrl("ftp://example.com")).toThrow("HTTPS");
  });

  it("rejects HTTP by default, allows when allowHttp:true", () => {
    expect(() => validateBaseUrl("http://example.com")).toThrow("HTTPS");
    expect(() => validateBaseUrl("http://example.com", { allowHttp: true })).not.toThrow();
  });

  it("accepts valid HTTPS URLs", () => {
    expect(() => validateBaseUrl("https://example.com")).not.toThrow();
    expect(() => validateBaseUrl("https://api.paymob.com/v1/intention")).not.toThrow();
    expect(() => validateBaseUrl("https://myfatoorah.com/api/v2")).not.toThrow();
  });
});

describe("validateBaseUrl — blocked hostnames", () => {
  const blockedHostnames = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
    "169.254.169.254", // AWS/GCP/Azure cloud-metadata
    "169.254.170.2",   // ECS task metadata
    "169.254.169.253", // AWS VPC DNS
    "metadata.google.internal",
    "metadata.azure.com",
  ];

  for (const h of blockedHostnames) {
    it(`rejects ${h}`, () => {
      expect(() => validateBaseUrl(`https://${h}/`)).toThrow();
    });
  }
});

describe("validateBaseUrl — private IPv4 literals", () => {
  const privateIPv4 = [
    "10.0.0.1", "10.255.255.255",
    "127.0.0.1", "127.1.1.1",
    "172.16.0.1", "172.31.255.255",
    "192.168.1.1", "192.168.0.0",
    "169.254.1.1", "169.254.169.254",
    "0.0.0.0", "0.1.2.3",
  ];

  for (const ip of privateIPv4) {
    it(`rejects https://${ip}/`, () => {
      expect(() => validateBaseUrl(`https://${ip}/`)).toThrow();
    });
  }

  it("does NOT reject 172.32.x.x (just above private range)", () => {
    expect(() => validateBaseUrl("https://172.32.0.1/")).not.toThrow();
  });

  it("does NOT reject 11.0.0.1 (just above 10/8)", () => {
    expect(() => validateBaseUrl("https://11.0.0.1/")).not.toThrow();
  });
});

describe("validateBaseUrl — private IPv6 literals", () => {
  const privateIPv6 = [
    "::1",
    "[::1]",
    "fe80::1",
    "[fe80::1]",
    "fc00::1",
    "[fc00::1]",
    "fd00::1",
    "[fd12:3456:789a::1]",
    "::ffff:127.0.0.1",
    "[::ffff:10.0.0.1]",
    "[::ffff:192.168.1.1]",
  ];

  for (const ip of privateIPv6) {
    it(`rejects https://${ip}/`, () => {
      expect(() => validateBaseUrl(`https://${ip}/`)).toThrow();
    });
  }

  it("does NOT reject public IPv6 (2606:4700::1 — Cloudflare)", () => {
    expect(() => validateBaseUrl("https://[2606:4700::1]/")).not.toThrow();
  });
});

describe("validateBaseUrl — internal hostnames", () => {
  const internalHosts = [
    "intranet",         // no dot
    "database",         // no dot
    "db.internal",
    "cache.local",
    "api.localhost",
    "service.intra",
    "secret.corp",
  ];

  for (const h of internalHosts) {
    it(`rejects ${h}`, () => {
      expect(() => validateBaseUrl(`https://${h}/`)).toThrow("داخلي");
    });
  }

  it("does NOT reject public hostnames", () => {
    expect(() => validateBaseUrl("https://api.openrouter.ai/")).not.toThrow();
    expect(() => validateBaseUrl("https://paymob.com/")).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. isPrivateIPv4 — every RFC 1918 + reserved range
// ═══════════════════════════════════════════════════════════════════════════

describe("isPrivateIPv4 — RFC 1918 + reserved ranges", () => {
  const cases: Array<[string, boolean, string]> = [
    // [ip, expectedIsPrivate, description]
    ["10.0.0.1", true, "10.0.0.0/8 private class A — start"],
    ["10.255.255.255", true, "10.0.0.0/8 private class A — end"],
    ["172.16.0.1", true, "172.16.0.0/12 private class B — start"],
    ["172.31.255.255", true, "172.16.0.0/12 private class B — end"],
    ["172.32.0.1", false, "172.32.x — just above private range"],
    ["172.15.0.1", false, "172.15.x — just below private range"],
    ["192.168.0.1", true, "192.168.0.0/16 private class C — start"],
    ["192.168.255.255", true, "192.168.0.0/16 private class C — end"],
    ["127.0.0.1", true, "127.0.0.0/8 loopback"],
    ["127.255.255.255", true, "127.0.0.0/8 loopback — end"],
    ["169.254.0.1", true, "169.254.0.0/16 link-local"],
    ["169.254.255.255", true, "169.254.0.0/16 link-local — end"],
    ["0.0.0.0", true, "0.0.0.0/8 'this host' range"],
    ["0.1.2.3", true, "0.0.0.0/8 'this host' range"],
    ["100.64.0.1", true, "100.64.0.0/10 CGNAT shared address — start"],
    ["100.127.255.255", true, "100.64.0.0/10 CGNAT — end"],
    ["100.63.255.255", false, "100.63.x — just below CGNAT"],
    ["100.128.0.1", false, "100.128.x — just above CGNAT"],
    ["192.0.2.1", true, "192.0.2.0/24 TEST-NET-1 (documentation)"],
    ["198.51.100.1", true, "198.51.100.0/24 TEST-NET-2"],
    ["203.0.113.1", true, "203.0.113.0/24 TEST-NET-3"],
    ["198.18.0.1", true, "198.18.0.0/15 benchmark testing — start"],
    ["198.19.255.255", true, "198.18.0.0/15 benchmark testing — end"],
    ["224.0.0.1", true, "224.0.0.0/4 multicast"],
    ["239.255.255.255", true, "224.0.0.0/4 multicast — end"],
    ["240.0.0.1", true, "240.0.0.0/4 reserved"],
    ["255.255.255.255", true, "240.0.0.0/4 reserved — end"],

    // Public IPs — must NOT be flagged as private
    ["1.1.1.1", false, "1.1.1.1 (Cloudflare)"],
    ["8.8.8.8", false, "8.8.8.8 (Google DNS)"],
    ["93.184.216.34", false, "93.184.216.34 (example.com)"],
    ["172.217.16.142", false, "172.217.x (Google) — NOT in 172.16/12"],
    ["11.0.0.1", false, "11.0.0.1 — just above 10/8"],
  ];

  for (const [ip, expected, desc] of cases) {
    it(`${desc}: isPrivateIPv4("${ip}") === ${expected}`, () => {
      expect(isPrivateIPv4(ip)).toBe(expected);
    });
  }

  it("returns false for non-IPv4 strings", () => {
    expect(isPrivateIPv4("not-an-ip")).toBe(false);
    expect(isPrivateIPv4("::1")).toBe(false); // IPv6 → not IPv4
  });

  it("rejects invalid octets (>255)", () => {
    expect(ipv4ToUint32("256.1.1.1")).toBeNull();
    expect(ipv4ToUint32("1.2.3.999")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. isPrivateIPv6 — loopback / link-local / ULA / v4-mapped-private
// ═══════════════════════════════════════════════════════════════════════════

describe("isPrivateIPv6 — loopback / link-local / ULA / v4-mapped", () => {
  const cases: Array<[string, boolean, string]> = [
    ["::1", true, "loopback"],
    ["fe80::1", true, "link-local fe80::/10 — start"],
    ["fe8f::1", true, "link-local fe80::/10 — boundary"],
    ["fe90::1", true, "link-local fe90::"],
    ["fea0::1", true, "link-local fea0::"],
    ["feb0::1", true, "link-local feb0::"],
    ["fec0::1", false, "fec0:: — just above fe80::/10 (deprecated site-local)"],
    ["ff00::1", false, "ff00::/8 multicast — NOT flagged (intent: only block private)"],
    ["fc00::1", true, "ULA fc00::/7 — start"],
    ["fd00::1", true, "ULA fc00::/7 — fd00"],
    ["fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", true, "ULA fc00::/7 — end"],
    ["fe00::1", false, "fe00:: — just below fe80::/10"],
    ["::ffff:127.0.0.1", true, "v4-mapped loopback"],
    ["::ffff:10.0.0.1", true, "v4-mapped private class A"],
    ["::ffff:192.168.1.1", true, "v4-mapped private class C"],
    ["::ffff:8.8.8.8", false, "v4-mapped public — NOT flagged"],

    // Public IPv6
    ["2606:4700::1", false, "Cloudflare DNS — public"],
    ["2001:4860:4860::8888", false, "Google public DNS — public"],
    ["2a00:1450:4001:800::200e", false, "Google — public"],
  ];

  for (const [ip, expected, desc] of cases) {
    it(`${desc}: isPrivateIPv6("${ip}") === ${expected}`, () => {
      expect(isPrivateIPv6(ip)).toBe(expected);
    });
  }

  it("strips [] brackets before checking", () => {
    expect(isPrivateIPv6("[::1]")).toBe(true);
    expect(isPrivateIPv6("[fe80::1]")).toBe(true);
    expect(isPrivateIPv6("[2606:4700::1]")).toBe(false);
  });
});

describe("isPrivateIP — dispatches by family", () => {
  it("routes IPv4 to isPrivateIPv4", () => {
    expect(isPrivateIP("10.0.0.1")).toBe(true);
    expect(isPrivateIP("8.8.8.8")).toBe(false);
  });
  it("routes IPv6 (contains ':') to isPrivateIPv6", () => {
    expect(isPrivateIP("::1")).toBe(true);
    expect(isPrivateIP("2606:4700::1")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. fetchSafe — DNS rebinding defense (mocked dns.lookup)
// ═══════════════════════════════════════════════════════════════════════════

describe("fetchSafe — DNS rebinding defense", () => {
  it("throws when DNS resolves to private IPv4", async () => {
    mockLookupImpl = async () => [{ address: "10.0.0.5", family: 4 }];
    await expect(fetchSafe("https://attacker.example.com/")).rejects.toThrow(
      /private\/internal IP.*10\.0\.0\.5.*DNS-rebinding/i,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when DNS resolves to 127.0.0.1 (loopback)", async () => {
    mockLookupImpl = async () => [{ address: "127.0.0.1", family: 4 }];
    await expect(fetchSafe("https://attacker.example.com/")).rejects.toThrow(
      /DNS-rebinding/i,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when DNS resolves to 169.254.169.254 (cloud metadata)", async () => {
    mockLookupImpl = async () => [{ address: "169.254.169.254", family: 4 }];
    await expect(fetchSafe("https://attacker.example.com/")).rejects.toThrow(
      /DNS-rebinding/i,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when DNS resolves to IPv6 loopback ::1", async () => {
    mockLookupImpl = async () => [{ address: "::1", family: 6 }];
    await expect(fetchSafe("https://attacker.example.com/")).rejects.toThrow(
      /DNS-rebinding/i,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when DNS resolves to IPv6 link-local fe80::1", async () => {
    mockLookupImpl = async () => [{ address: "fe80::1", family: 6 }];
    await expect(fetchSafe("https://attacker.example.com/")).rejects.toThrow(
      /DNS-rebinding/i,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when DNS resolves to IPv6 ULA fc00::1", async () => {
    mockLookupImpl = async () => [{ address: "fc00::1", family: 6 }];
    await expect(fetchSafe("https://attacker.example.com/")).rejects.toThrow(
      /DNS-rebinding/i,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when DNS resolves to IPv6 ULA fd00::1", async () => {
    mockLookupImpl = async () => [{ address: "fd00::1", family: 6 }];
    await expect(fetchSafe("https://attacker.example.com/")).rejects.toThrow(
      /DNS-rebinding/i,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when ANY of multiple A records is private (mix attack)", async () => {
    // Attacker registers two A records: one legit public IP, one private.
    // fetchSafe must reject the entire fetch, not just skip the bad IP.
    mockLookupImpl = async () => [
      { address: "93.184.216.34", family: 4 }, // public — example.com
      { address: "10.0.0.5", family: 4 },      // private — attacker's internal
    ];
    await expect(fetchSafe("https://attacker.example.com/")).rejects.toThrow(
      /DNS-rebinding/i,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when DNS resolves to this machine's own IP (self-fetch)", async () => {
    // Pick whatever IP is on the loopback interface — guaranteed to be in
    // the LOCAL_MACHINE_IPS set.
    const ownIp = Array.from(__test.LOCAL_MACHINE_IPS)[0] || "127.0.0.1";
    mockLookupImpl = async () => [{ address: ownIp, family: ownIp.includes(":") ? 6 : 4 }];
    // The own-IP check is a SECOND line of defense — most local interfaces
    // have private IPs (127.0.0.1, 10.x, 192.168.x) which the FIRST check
    // (isPrivateIP) catches. The own-IP check only fires for non-private
    // machine IPs (e.g. a Vercel function's public IP). For this test we
    // accept EITHER error message — both are correct refusals.
    await expect(fetchSafe("https://attacker.example.com/")).rejects.toThrow(
      /private\/internal IP|this machine's own IP/i,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when DNS lookup fails entirely", async () => {
    mockLookupImpl = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(fetchSafe("https://nonexistent.invalid/")).rejects.toThrow(
      /DNS lookup failed.*ENOTFOUND/i,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when DNS returns empty list", async () => {
    mockLookupImpl = async () => [];
    await expect(fetchSafe("https://empty.example.com/")).rejects.toThrow(
      /no records/i,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. fetchSafe — TLS/SNI correctness (P1-A.1 fix)
// ═══════════════════════════════════════════════════════════════════════════

describe("fetchSafe — TLS/SNI correctness (P1-A.1)", () => {
  it("fetches the ORIGINAL URL when DNS resolves to a public IP", async () => {
    mockLookupImpl = async () => [{ address: "93.184.216.34", family: 4 }];
    await fetchSafe("https://api.paymob.com/v1/intention");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchArg = mockFetch.mock.calls[0][0];
    // Critical: URL must be the ORIGINAL hostname, NOT the IP literal.
    // If the URL were rewritten to https://93.184.216.34/v1/intention,
    // TLS SNI would use the IP and Paymob's cert (issued for api.paymob.com)
    // would FAIL validation.
    expect(fetchArg).toBe("https://api.paymob.com/v1/intention");
    expect(fetchArg).not.toContain("93.184.216.34");
  });

  it("does NOT set an explicit Host header (let fetch derive it from URL)", async () => {
    mockLookupImpl = async () => [{ address: "93.184.216.34", family: 4 }];
    await fetchSafe("https://api.openrouter.ai/api/v1/chat", {
      headers: { Authorization: "Bearer sk-or-..." },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    // We should NOT inject a Host header — fetch derives it from the URL
    // and uses the same value for TLS SNI.
    expect(headers.has("Host")).toBe(false);
    // Caller's headers should pass through untouched.
    expect(headers.get("Authorization")).toBe("Bearer sk-or-...");
  });

  it("preserves port, path, query, and fragment in the fetched URL", async () => {
    mockLookupImpl = async () => [{ address: "93.184.216.34", family: 4 }];
    await fetchSafe("https://api.example.com:8443/v2/charges?id=42#section");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchArg = mockFetch.mock.calls[0][0];
    expect(fetchArg).toBe("https://api.example.com:8443/v2/charges?id=42#section");
  });

  it("preserves caller's init (method, body, headers) untouched", async () => {
    mockLookupImpl = async () => [{ address: "93.184.216.34", family: 4 }];
    const body = JSON.stringify({ amount: 100 });
    await fetchSafe("https://api.example.com/charge", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(body);
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("does NOT do a DNS lookup when URL is already an IP literal", async () => {
    // validateBaseUrl allows public IP literals (8.8.8.8 is public).
    // In that case fetchSafe should skip dns.lookup entirely.
    const lookupSpy = mockLookupImpl;
    let lookupCalled = false;
    mockLookupImpl = async () => {
      lookupCalled = true;
      return [{ address: "8.8.8.8", family: 4 }];
    };

    await fetchSafe("https://8.8.8.8/dns");

    expect(lookupCalled).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("https://8.8.8.8/dns");
    void lookupSpy;
  });

  it("rejects IP-literal private URLs WITHOUT doing a DNS lookup", async () => {
    let lookupCalled = false;
    mockLookupImpl = async () => {
      lookupCalled = true;
      return [];
    };

    await expect(fetchSafe("https://10.0.0.5/")).rejects.toThrow();
    expect(lookupCalled).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. isSafeUrl — soft wrapper
// ═══════════════════════════════════════════════════════════════════════════

describe("isSafeUrl", () => {
  it("returns true for safe URLs (no throw)", () => {
    expect(isSafeUrl("https://api.paymob.com")).toBe(true);
    expect(isSafeUrl("https://api.openrouter.ai/v1")).toBe(true);
  });

  it("returns false for unsafe URLs (would throw)", () => {
    expect(isSafeUrl("https://10.0.0.1")).toBe(false);
    expect(isSafeUrl("https://localhost")).toBe(false);
    expect(isSafeUrl("https://169.254.169.254/")).toBe(false);
    expect(isSafeUrl("not a url")).toBe(false);
    expect(isSafeUrl("ftp://example.com")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. PRIVATE_IPV4_PREFIXES — sanity check the table itself
// ═══════════════════════════════════════════════════════════════════════════

describe("PRIVATE_IPV4_PREFIXES — table sanity", () => {
  it("covers all required ranges", () => {
    const ranges = PRIVATE_IPV4_PREFIXES.map((p) => ({
      first: p.first >>> 0,
      mask: p.mask >>> 0,
    }));

    // Convert each range to dotted-quad for readability
    const toQuad = (n: number) =>
      [24, 16, 8, 0].map((s) => ((n >>> s) & 0xff).toString()).join(".");

    const described = ranges.map(
      (r) => `${toQuad(r.first)}/${toQuad(r.mask).split(".").map((o) => parseInt(o, 10).toString(2).padStart(8, "0")).join("")}`,
    );
    void described;

    // Must include at least these (CIDR representation):
    expect(ranges.length).toBeGreaterThanOrEqual(13);
    // 10.0.0.0/8
    expect(ranges).toContainEqual({ first: 0x0a000000, mask: 0xff000000 });
    // 127.0.0.0/8
    expect(ranges).toContainEqual({ first: 0x7f000000, mask: 0xff000000 });
    // 169.254.0.0/16
    expect(ranges).toContainEqual({ first: 0xa9fe0000, mask: 0xffff0000 });
    // 172.16.0.0/12
    expect(ranges).toContainEqual({ first: 0xac100000, mask: 0xfff00000 });
    // 192.168.0.0/16
    expect(ranges).toContainEqual({ first: 0xc0a80000, mask: 0xffff0000 });
    // 100.64.0.0/10 (CGNAT)
    expect(ranges).toContainEqual({ first: 0x64400000, mask: 0xffc00000 });
    // 224.0.0.0/4 (multicast)
    expect(ranges).toContainEqual({ first: 0xe0000000, mask: 0xf0000000 });
    // 240.0.0.0/4 (reserved)
    expect(ranges).toContainEqual({ first: 0xf0000000, mask: 0xf0000000 });
  });
});
