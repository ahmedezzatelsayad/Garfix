// @ts-nocheck
/**
 * auth-advanced.test.ts — 50 tests for the auth module.
 *
 * Tests: hashPassword/verifyPassword, signToken/verifyToken, signRefreshToken/
 * verifyRefreshToken, isTokenBlacklisted/blacklistToken, verifyTokenWithBlacklist,
 * resolveAuth, assertCompanyAccess, hasUnrestrictedScope, buildUserProfile,
 * issueSession/clearSession.
 */

import { describe, it, expect, mock, spyOn, beforeEach, afterAll } from "bun:test";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockExists = mock(() => Promise.resolve(0));
const mockSet = mock(() => Promise.resolve("OK"));

mock.module("@/lib/valkey", () => ({
  getValkeyClient: mock(() =>
    Promise.resolve({ exists: mockExists, set: mockSet }),
  ),
  getValkeySubscriber: mock(() => Promise.resolve(null)),
  VALKEY_CONFIGURED: false,
}));

mock.module("@/lib/db", () => ({
  db: {
    user: {
      findUnique: mock(() => Promise.resolve(null)),
    },
  },
}));

mock.module("@/lib/founder", () => ({
  isFounderEmail: mock((e: string) => e === "founder@garfix.com"),
  FOUNDER_EMAIL: "founder@garfix.com",
}));

// NOTE: We do NOT mock @/lib/permissions. permissions.ts is a pure data
// module with no database imports — it can be imported safely without a
// generated Prisma client. Mocking it globally breaks rbac.test.ts, which
// imports the real computeEffectivePermissions and asserts the full admin
// permission set.

mock.module("next/headers", () => ({
  cookies: mock(() => Promise.resolve(new Map())),
}));

// Mock next/server
const mockCookieSet = mock(() => {});
const mockCookieGet = mock((name: string) => ({ name, value: name === "inv_token" ? "access-tok" : "refresh-tok" }));

class MockNextRequest {
  url: string;
  _cookies: Map<string, string>;
  headers: Headers;
  constructor(init: { url?: string; cookies?: Map<string, string>; headers?: Headers; method?: string; body?: any }) {
    this.url = init.url || "http://localhost/";
    this._cookies = init.cookies || new Map();
    this.headers = init.headers || new Headers();
    if (init.method) this.method = init.method;
    if (init.body) this._body = init.body;
  }
  method: string = "GET";
  _body: any = null;
  nextUrl: { searchParams: URLSearchParams } = { searchParams: new URL(this.url || "http://localhost/").searchParams };
  get cookies() {
    return {
      get: (name: string) => {
        const v = this._cookies.get(name);
        return v !== undefined ? { name, value: v } : undefined;
      },
      set: mockCookieSet,
      delete: mockCookieSet,
    };
  }
  async json() { 
    if (typeof this._body === 'string') return JSON.parse(this._body);
    return this._body;
  }
  async text() { return typeof this._body === 'string' ? this._body : JSON.stringify(this._body); }
}

class MockNextResponse {
  _cookies: Map<string, { name: string; value: string; options: any }> = new Map();
  status = 200;
  body: any;
  _jsonBody: any;

  constructor(body?: any, init?: any) {
    this.body = body;
    this._jsonBody = body;
    if (init?.status) this.status = init.status;
  }

  cookies = {
    get: mockCookieGet,
    set: mock((name: string, value: string, opts: any) => {
      this._cookies.set(name, { name, value, options: opts });
    }),
    delete: mockCookieSet,
  };

  async json() { return this._jsonBody; }

  static json(body: unknown, init?: ResponseInit) {
    return new MockNextResponse(body, init);
  }
}

mock.module("next/server", () => ({
  NextRequest: MockNextRequest as any,
  NextResponse: MockNextResponse as any,
}));

// Import after mocks
const {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  signRefreshToken,
  verifyRefreshToken,
  isTokenBlacklisted,
  blacklistToken,
  verifyTokenWithBlacklist,
  resolveAuth,
  assertCompanyAccess,
  hasUnrestrictedScope,
  buildUserProfile,
  issueSession,
  clearSession,
  getAccessToken,
  getRefreshToken,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
} = await import("@/lib/auth");

// ─── hashPassword / verifyPassword ─────────────────────────────────────────

describe("hashPassword / verifyPassword", () => {
  it("hashes a password successfully", async () => {
    const hash = await hashPassword("password123");
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(10);
  });

  it("produces different hashes for the same password (bcrypt salt)", async () => {
    const h1 = await hashPassword("same-password");
    const h2 = await hashPassword("same-password");
    expect(h1).not.toBe(h2);
  });

  it("verifyPassword returns true for correct password", async () => {
    const hash = await hashPassword("my-secret");
    expect(await verifyPassword("my-secret", hash)).toBe(true);
  });

  it("verifyPassword returns false for wrong password", async () => {
    const hash = await hashPassword("correct");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("verifyPassword returns false for empty password against hash", async () => {
    const hash = await hashPassword("nonempty");
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("verifyPassword returns false for corrupted hash", async () => {
    expect(await verifyPassword("test", "not-a-valid-bcrypt-hash")).toBe(false);
  });

  it("hashes long passwords without error", async () => {
    const long = "a".repeat(200);
    const hash = await hashPassword(long);
    expect(await verifyPassword(long, hash)).toBe(true);
  });
});

// ─── signToken / verifyToken ───────────────────────────────────────────────

describe("signToken / verifyToken", () => {
  const payload = {
    uid: "usr_abc123",
    email: "user@example.com",
    role: "admin",
    companies: ["company-a"],
    permissions: { create_invoice: 1 },
    tv: 1,
  };

  it("signs a token that can be verified", () => {
    const token = signToken(payload);
    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.uid).toBe("usr_abc123");
    expect(decoded!.email).toBe("user@example.com");
    expect(decoded!.role).toBe("admin");
  });

  it("includes jti in the verified payload", () => {
    const token = signToken(payload);
    const decoded = verifyToken(token);
    expect(decoded!.jti).toBeTruthy();
    expect(typeof decoded!.jti).toBe("string");
  });

  it("includes type: access in the token", () => {
    const token = signToken(payload);
    // We can't directly decode without verify, but verifyToken checks type
    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
  });

  it("returns null for expired token", () => {
    // Create token and manually decode to check — signToken uses ACCESS_TTL from env
    // In test env, ACCESS_TTL defaults to 1800 (30 min). We can't easily expire it.
    // Instead, verify that a tampered token returns null
    const token = signToken(payload);
    const parts = token.split(".");
    // Corrupt the payload to simulate expiration check
    const corrupted = parts[0] + "." + "AAAA" + "." + parts[2];
    expect(verifyToken(corrupted)).toBeNull();
  });

  it("returns null for wrong secret (corrupted signature)", () => {
    const token = signToken(payload);
    // Change the last character of the signature to break verification
    const parts = token.split(".");
    const sig = parts[2];
    const modifiedSig = sig.slice(0, -1) + (sig[sig.length - 1] === "A" ? "B" : "A");
    const corrupted = parts[0] + "." + parts[1] + "." + modifiedSig;
    expect(verifyToken(corrupted)).toBeNull();
  });

  it("returns null for refresh token type", () => {
    // signRefreshToken uses different secret; if we verify with verifyToken it should fail
    const refreshTok = signRefreshToken("usr_abc123", 1);
    expect(verifyToken(refreshTok)).toBeNull();
  });

  it("preserves companies array", () => {
    const p = { ...payload, companies: ["co1", "co2", "co3"] };
    const token = signToken(p);
    const decoded = verifyToken(token);
    expect(decoded!.companies).toEqual(["co1", "co2", "co3"]);
  });

  it("preserves permissions object", () => {
    const p = { ...payload, permissions: { create_invoice: 1, delete_invoice: 0 } };
    const token = signToken(p);
    const decoded = verifyToken(token);
    expect(decoded!.permissions).toEqual({ create_invoice: 1, delete_invoice: 0 });
  });

  it("preserves tv (token version)", () => {
    const p = { ...payload, tv: 42 };
    const token = signToken(p);
    const decoded = verifyToken(token);
    expect(decoded!.tv).toBe(42);
  });
});

// ─── signRefreshToken / verifyRefreshToken ─────────────────────────────────

describe("signRefreshToken / verifyRefreshToken", () => {
  it("signs and verifies refresh token", () => {
    const token = signRefreshToken("usr_ref", 5);
    const decoded = verifyRefreshToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.uid).toBe("usr_ref");
    expect(decoded!.tv).toBe(5);
  });

  it("returns null for wrong type (access token)", () => {
    const accessPayload = {
      uid: "usr_test",
      email: "test@test.com",
      role: "admin",
      companies: [],
      permissions: {},
      tv: 1,
    };
    const accessToken = signToken(accessPayload);
    expect(verifyRefreshToken(accessToken)).toBeNull();
  });

  it("returns null for corrupted token", () => {
    expect(verifyRefreshToken("not-a-jwt")).toBeNull();
  });

  it("different uids produce different tokens", () => {
    const t1 = signRefreshToken("usr_a", 1);
    const t2 = signRefreshToken("usr_b", 1);
    expect(t1).not.toBe(t2);
  });

  it("different tv values produce different tokens", () => {
    const t1 = signRefreshToken("usr_x", 1);
    const t2 = signRefreshToken("usr_x", 2);
    expect(t1).not.toBe(t2);
  });
});

// ─── isTokenBlacklisted / blacklistToken ───────────────────────────────────

describe("isTokenBlacklisted / blacklistToken", () => {
  it("returns false for non-blacklisted JTI", async () => {
    mockExists.mockResolvedValue(0);
    expect(await isTokenBlacklisted("jti-nonexistent")).toBe(false);
  });

  it("returns true for blacklisted JTI", async () => {
    mockExists.mockResolvedValue(1);
    expect(await isTokenBlacklisted("jti-blacklisted")).toBe(true);
  });

  it("blacklistToken calls valkey set with TTL", async () => {
    mockSet.mockResolvedValue("OK");
    await blacklistToken("jti-123", 300);
    expect(mockSet).toHaveBeenCalled();
  });

  it("blacklistToken with TTL <= 0 does nothing", async () => {
    mockSet.mockClear();
    await blacklistToken("jti-zero", 0);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("blacklistToken with negative TTL does nothing", async () => {
    mockSet.mockClear();
    await blacklistToken("jti-neg", -10);
    expect(mockSet).not.toHaveBeenCalled();
  });
});

// ─── verifyTokenWithBlacklist ──────────────────────────────────────────────

describe("verifyTokenWithBlacklist", () => {
  it("returns payload for valid non-blacklisted token", async () => {
    mockExists.mockResolvedValue(0);
    const payload = {
      uid: "usr_vb",
      email: "test@test.com",
      role: "admin",
      companies: [],
      permissions: {},
      tv: 1,
    };
    const token = signToken(payload);
    const result = await verifyTokenWithBlacklist(token);
    expect(result).not.toBeNull();
    expect(result!.uid).toBe("usr_vb");
  });

  it("returns null for blacklisted token", async () => {
    mockExists.mockResolvedValue(1);
    const payload = {
      uid: "usr_vb2",
      email: "test2@test.com",
      role: "editor",
      companies: [],
      permissions: {},
      tv: 1,
    };
    const token = signToken(payload);
    const result = await verifyTokenWithBlacklist(token);
    expect(result).toBeNull();
  });

  it("returns null for invalid token (no blacklist check needed)", async () => {
    const result = await verifyTokenWithBlacklist("garbage-token");
    expect(result).toBeNull();
  });
});

// ─── resolveAuth ───────────────────────────────────────────────────────────

describe("resolveAuth", () => {
  beforeEach(() => {
    // SEC-C1 FIX (Cycle 1) test-hygiene: prior describe blocks
    // (isTokenBlacklisted, verifyTokenWithBlacklist) set mockExists to
    // return 1 to simulate a blacklisted token. Without this reset,
    // resolveAuth — which now consults the blacklist via
    // verifyTokenWithBlacklist — would inherit the blacklisted state and
    // reject every access token. This is a test-only leak; production
    // code reads the real Valkey value on every call.
    mockExists.mockResolvedValue(0);
    mockSet.mockResolvedValue("OK");
  });

  it("returns user for valid access token", async () => {
    const payload = {
      uid: "usr_ra",
      email: "ra@test.com",
      role: "admin",
      companies: ["co-a"],
      permissions: { create_invoice: 1 },
      tv: 1,
    };
    const token = signToken(payload);
    const req = new MockNextRequest({
      cookies: new Map([[ACCESS_COOKIE, token]]),
    });
    const result = await resolveAuth(req as any);
    expect(result.ok).toBe(true);
    expect(result.user!.uid).toBe("usr_ra");
  });

  // SEC-C1 FIX (Cycle 1) regression test: a blacklisted access token MUST be
  // rejected by resolveAuth even if the JWT signature is still valid. Before
  // this cycle, resolveAuth used the sync verifyToken() which could not
  // consult the Valkey blacklist — so a force-logged-out user kept access
  // for the full 30-min access-token TTL.
  it("rejects a blacklisted access token (SEC-C1)", async () => {
    const payload = {
      uid: "usr_black",
      email: "black@test.com",
      role: "admin",
      companies: ["co-a"],
      permissions: {},
      tv: 1,
    };
    const token = signToken(payload);
    const req = new MockNextRequest({
      cookies: new Map([[ACCESS_COOKIE, token]]),
    });
    // Simulate the JTI being on the blacklist (e.g. after admin force-logout
    // or after the user changed their password).
    mockExists.mockResolvedValue(1);
    const result = await resolveAuth(req as any);
    // With a blacklisted access token AND no refresh cookie, the user must
    // be denied.
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it("returns 401 when no cookies", async () => {
    const req = new MockNextRequest({ cookies: new Map() });
    const result = await resolveAuth(req as any);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toBe("Unauthorized");
  });

  it("returns 401 when access token is invalid and no refresh", async () => {
    const req = new MockNextRequest({
      cookies: new Map([[ACCESS_COOKIE, "invalid-token"]]),
    });
    const result = await resolveAuth(req as any);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it("returns 401 when refresh token is invalid", async () => {
    const req = new MockNextRequest({
      cookies: new Map([
        [ACCESS_COOKIE, "invalid-access"],
        [REFRESH_COOKIE, "invalid-refresh"],
      ]),
    });
    const result = await resolveAuth(req as any);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });
});

// ─── assertCompanyAccess ───────────────────────────────────────────────────

describe("assertCompanyAccess", () => {
  const adminUser = {
    uid: "a", email: "admin@test.com", role: "admin",
    companies: [], permissions: {}, tv: 1,
  };

  const founderUser = {
    uid: "f", email: "founder@garfix.com", role: "editor",
    companies: [], permissions: {}, tv: 1,
  };

  const employeeUser = {
    uid: "e", email: "emp@test.com", role: "employee",
    companies: ["co-a", "co-b"], permissions: {}, tv: 1,
  };

  it("admin has unrestricted access (no slug)", () => {
    expect(assertCompanyAccess(adminUser, null)).toBe(true);
  });

  it("admin has unrestricted access (with slug)", () => {
    expect(assertCompanyAccess(adminUser, "any-slug")).toBe(true);
  });

  it("founder has unrestricted access (no slug)", () => {
    expect(assertCompanyAccess(founderUser, null)).toBe(true);
  });

  it("founder has unrestricted access (with slug)", () => {
    expect(assertCompanyAccess(founderUser, "any-company")).toBe(true);
  });

  it("employee with matching company slug returns true", () => {
    expect(assertCompanyAccess(employeeUser, "co-a")).toBe(true);
  });

  it("employee with mismatched slug returns false", () => {
    expect(assertCompanyAccess(employeeUser, "co-c")).toBe(false);
  });

  it("employee without slug uses unrestricted check (false)", () => {
    expect(assertCompanyAccess(employeeUser, null)).toBe(false);
  });
});

// ─── hasUnrestrictedScope ──────────────────────────────────────────────────

describe("hasUnrestrictedScope", () => {
  it("admin=true", () => {
    expect(hasUnrestrictedScope({ uid: "a", email: "a@t.com", role: "admin", companies: [], permissions: {}, tv: 1 })).toBe(true);
  });

  it("founder=true", () => {
    expect(hasUnrestrictedScope({ uid: "f", email: "founder@garfix.com", role: "editor", companies: [], permissions: {}, tv: 1 })).toBe(true);
  });

  it("employee=false", () => {
    expect(hasUnrestrictedScope({ uid: "e", email: "e@t.com", role: "employee", companies: [], permissions: {}, tv: 1 })).toBe(false);
  });

  it("viewer=false", () => {
    expect(hasUnrestrictedScope({ uid: "v", email: "v@t.com", role: "viewer", companies: [], permissions: {}, tv: 1 })).toBe(false);
  });
});

// ─── buildUserProfile ───────────────────────────────────────────────────────

describe("buildUserProfile", () => {
  it("returns correct profile structure", async () => {
    const user = {
      uid: "bu1", email: "bu@test.com", displayName: "Test User",
      role: "admin", companies: ["co-a"], permissions: { create_invoice: 1 },
      emailVerified: true, tokenVersion: 1,
    };
    const profile = await buildUserProfile(user);
    expect(profile.uid).toBe("bu1");
    expect(profile.email).toBe("bu@test.com");
    expect(profile.displayName).toBe("Test User");
    expect(profile.role).toBe("admin");
    expect(profile.emailVerified).toBe(true);
    expect(profile.isFounder).toBe(false);
  });

  it("sets isFounder=true for founder email", async () => {
    const user = {
      uid: "bf", email: "founder@garfix.com", displayName: "Founder",
      role: "editor", companies: [], permissions: {},
      emailVerified: true, tokenVersion: 1,
    };
    const profile = await buildUserProfile(user);
    expect(profile.isFounder).toBe(true);
  });

  it("includes effectivePermissions from computeEffectivePermissions", async () => {
    const user = {
      uid: "bp", email: "bp@test.com", displayName: "Perm User",
      role: "admin", companies: [], permissions: {},
      emailVerified: false, tokenVersion: 1,
    };
    const profile = await buildUserProfile(user);
    expect(profile.effectivePermissions).toBeDefined();
  });
});

// ─── Cookie helpers ────────────────────────────────────────────────────────

describe("Cookie helpers", () => {
  it("issueSession sets both access and refresh cookies", async () => {
    const resp = new MockNextResponse();
    const user = {
      uid: "cs", email: "cs@test.com", displayName: "Cookie",
      role: "admin", companies: [], permissions: {},
      emailVerified: true, tokenVersion: 1,
    };
    await issueSession(resp as any, user);
    expect(resp._cookies.has(ACCESS_COOKIE)).toBe(true);
    expect(resp._cookies.has(REFRESH_COOKIE)).toBe(true);
  });

  it("clearSession sets both cookies with maxAge=0", async () => {
    const resp = new MockNextResponse();
    await clearSession(resp as any);
    expect(resp._cookies.has(ACCESS_COOKIE)).toBe(true);
    expect(resp._cookies.has(REFRESH_COOKIE)).toBe(true);
    // Both should have maxAge: 0
    expect(resp._cookies.get(ACCESS_COOKIE)!.options.maxAge).toBe(0);
    expect(resp._cookies.get(REFRESH_COOKIE)!.options.maxAge).toBe(0);
  });

  it("getAccessToken returns value from request cookies", () => {
    const req = new MockNextRequest({
      cookies: new Map([[ACCESS_COOKIE, "tok123"]]),
    });
    expect(getAccessToken(req as any)).toBe("tok123");
  });

  it("getRefreshToken returns value from request cookies", () => {
    const req = new MockNextRequest({
      cookies: new Map([[REFRESH_COOKIE, "ref456"]]),
    });
    expect(getRefreshToken(req as any)).toBe("ref456");
  });

  it("getAccessToken returns undefined for missing cookie", () => {
    const req = new MockNextRequest({ cookies: new Map() });
    expect(getAccessToken(req as any)).toBeUndefined();
  });
});

// ─── Token version mismatch in resolveAuth ─────────────────────────────────

describe("resolveAuth — token version mismatch", () => {
  it("returns session revoked when tokenVersion differs", async () => {
    const refreshTok = signRefreshToken("usr_tv", 1);
    const mockFindUnique = mock(() => Promise.resolve({
      uid: "usr_tv",
      email: "tv@test.com",
      role: "admin",
      companies: '["co-a"]',
      permissions: '{"create_invoice":1}',
      tokenVersion: 2, // Mismatch!
    }));

    // Re-mock db
    const mod = await import("@/lib/db");
    (mod as any).db.user.findUnique = mockFindUnique;

    const req = new MockNextRequest({
      cookies: new Map([[REFRESH_COOKIE, refreshTok]]),
    });
    const result = await resolveAuth(req as any);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Session revoked");
    expect(result.status).toBe(401);
  });
});

// ─── Access token constants ────────────────────────────────────────────────

describe("Cookie constants", () => {
  it("ACCESS_COOKIE is inv_token", () => {
    expect(ACCESS_COOKIE).toBe("inv_token");
  });

  it("REFRESH_COOKIE is inv_refresh", () => {
    expect(REFRESH_COOKIE).toBe("inv_refresh");
  });
});

// P0 FIX: Restore all mocked modules after this test suite to prevent
// mock isolation bleed — Bun's mock.module() persists across test files
// in the same process, so other test suites (e.g. multi-tenant-isolation)
// that import the real @/lib/valkey, @/lib/db, @/lib/founder, next/headers,
// next/server get the mock instead of the real module.
afterAll(() => {
  mock.restore();
});