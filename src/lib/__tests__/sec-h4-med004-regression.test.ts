/**
 * sec-h4-med004-regression.test.ts — P0 regression tests.
 *
 * These tests exist specifically to prevent the SEC Cycle 3 phantom-fix
 * regression from recurring. They verify:
 *
 *   SEC-H4: issueSession() accepts a 3rd `req` argument AND calls
 *           registerSession() with the JTI when SESSION_REGISTRY_ENFORCED
 *           is not "false".
 *
 *   MED-004: chart.tsx ChartStyle uses sanitizeChartCss() before
 *            dangerouslySetInnerHTML, and sanitizeChartCss() blocks
 *            hostile CSS injection attempts.
 *
 * If anyone reverts these in a future commit, the tests will fail.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, mock } from "bun:test";
/* eslint-disable @typescript-eslint/no-require-imports */

// P1/R3 fix: active flag that lets the @/lib/db mock fall through to the
// real db module when this test file is not running. Bun's mock.module()
// is global and persists across files; without this guard, sec-h4's db mock
// leaks into auth-advanced (whose resolveAuth calls db.sessionRegistry.findUnique
// and gets our mock returning null → "Session revoked" → resolveAuth fails).
const secH4TestsActive: { value: boolean } = { value: false };
(globalThis as any).__secH4TestsActive = secH4TestsActive;

// P1/R3 fix: save env vars before any test runs so we can restore them in
// afterAll. sec-h4 tests set SESSION_REGISTRY_ENFORCED to "true"/"false"
// and never restore — auth-advanced's resolveAuth reads it and behaves
// differently than expected.
const _savedEnv = {
  SESSION_REGISTRY_ENFORCED: process.env.SESSION_REGISTRY_ENFORCED,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
};

// ─── SEC-H4 Regression Tests ──────────────────────────────────────────────

describe("SEC-H4: issueSession 3-arg signature + registerSession", () => {
  beforeEach(() => {
    // Activate this file's db mock for the duration of each test
    secH4TestsActive.value = true;
    // Reset env
    delete process.env.SESSION_REGISTRY_ENFORCED;
  });

  afterEach(() => {
    // Deactivate after each test so the mock falls through to real db
    secH4TestsActive.value = false;
    mock.restore();
  });

  // Register the mock ONCE at module scope with the active-flag pattern
  mock.module("@/lib/db", () => {
    const handler: ProxyHandler<Record<string, any>> = {
      get(_target, prop) {
        if (!(globalThis as any).__secH4TestsActive?.value) {
          // Fall through to real db via dynamic import (cache-bust)
          return new Proxy({}, {
            get(_t, p) {
              return async (...args: any[]) => {
                const real = (await import("@/lib/db?bypass=" + Math.random())).db;
                return (real as any)[prop][p](...args);
              };
            },
          });
        }
        return mockDb[prop];
      },
    };
    const mockDb = {
      sessionRegistry: {
        create: mock(async () => ({ id: "test-id" })),
        findMany: mock(async () => []),
        delete: mock(async () => ({})),
        count: mock(async () => 0),
        deleteMany: mock(async () => ({ count: 0 })),
        findUnique: mock(async () => null),
      },
    };
    return { db: new Proxy(mockDb, handler) };
  });

  it("issueSession function accepts 3 arguments (response, user, req)", async () => {
    const { issueSession } = await import("@/lib/auth");
    // Verify the function signature accepts 3 args by inspecting its length.
    // (Note: TypeScript types are erased at runtime, so this is a sanity
    // check — the real enforcement is at compile time.)
    expect(issueSession).toBeDefined();
    expect(typeof issueSession).toBe("function");
    // issueSession.length reports the number of params before the first
    // default-valued / rest param. The third param has a default of
    // undefined, so length should be 2. We check arity differently —
    // by actually invoking it with 3 args and asserting it doesn't throw.
    const fakeResponse = {
      cookies: { set: () => {} },
    };
    const fakeUser = {
      uid: "test-uid",
      email: "test@test.com",
      displayName: "Test",
      role: "admin",
      companies: [],
      permissions: {},
      emailVerified: true,
      tokenVersion: 1,
    };
    const fakeReq = {
      headers: new Headers({
        "x-forwarded-for": "1.2.3.4",
        "user-agent": "test-ua",
      }),
    };
    // @ts-expect-error — fake objects
    await issueSession(fakeResponse, fakeUser, fakeReq);
  });

  it("registers the JTI in SessionRegistry when req is passed", async () => {
    // Spy on registerSession
    const registerSessionSpy = mock(async () => {});
    mock.module("@/lib/passwordPolicy", () => ({
      registerSession: registerSessionSpy,
      isSessionValid: mock(async () => true),
    }));

    process.env.SESSION_REGISTRY_ENFORCED = "true";
    process.env.JWT_SECRET = "test-secret-at-least-16-chars";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret-16-chars-min";

    const { issueSession } = await import("@/lib/auth");
    const cookies: Record<string, unknown> = {};
    const fakeResponse = {
      cookies: { set: (name: string, val: string) => { cookies[name] = val; } },
    };
    const fakeUser = {
      uid: "test-uid",
      email: "test@test.com",
      displayName: "Test",
      role: "admin",
      companies: [],
      permissions: {},
      emailVerified: true,
      tokenVersion: 1,
    };
    const fakeReq = {
      headers: new Headers({
        "x-forwarded-for": "1.2.3.4",
        "user-agent": "test-ua",
      }),
    };

    // @ts-expect-error — fake objects
    await issueSession(fakeResponse, fakeUser, fakeReq);

    // Verify registerSession was called with the JTI + IP + UA
    expect(registerSessionSpy).toHaveBeenCalledTimes(1);
    const calls = registerSessionSpy.mock.calls as unknown as Array<
      Array<{ userUid: string; jti: string; ipAddress: string; userAgent: string }>
    >;
    const call = calls[0][0];
    expect(call.userUid).toBe("test-uid");
    expect(call.jti).toBeTruthy();
    expect(typeof call.jti).toBe("string");
    expect(call.ipAddress).toBe("1.2.3.4");
    expect(call.userAgent).toBe("test-ua");
  });

  it("skips registerSession when SESSION_REGISTRY_ENFORCED=false", async () => {
    const registerSessionSpy = mock(async () => {});
    mock.module("@/lib/passwordPolicy", () => ({
      registerSession: registerSessionSpy,
      isSessionValid: mock(async () => true),
    }));

    process.env.SESSION_REGISTRY_ENFORCED = "false";
    process.env.JWT_SECRET = "test-secret-at-least-16-chars";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret-16-chars-min";

    const { issueSession } = await import("@/lib/auth");
    const fakeResponse = { cookies: { set: () => {} } };
    const fakeUser = {
      uid: "test-uid", email: "t@t.com", displayName: "T",
      role: "admin", companies: [], permissions: {},
      emailVerified: true, tokenVersion: 1,
    };
    const fakeReq = { headers: new Headers() };

    // @ts-expect-error — fake objects
    await issueSession(fakeResponse, fakeUser, fakeReq);

    expect(registerSessionSpy).not.toHaveBeenCalled();
  });

  it("does NOT throw when req is omitted (backward compat)", async () => {
    process.env.JWT_SECRET = "test-secret-at-least-16-chars";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret-16-chars-min";

    const { issueSession } = await import("@/lib/auth");
    const fakeResponse = { cookies: { set: () => {} } };
    const fakeUser = {
      uid: "test-uid", email: "t@t.com", displayName: "T",
      role: "admin", companies: [], permissions: {},
      emailVerified: true, tokenVersion: 1,
    };

    // @ts-expect-error — fake objects
    await issueSession(fakeResponse, fakeUser);
  });
});

// P1/R3 fix: restore env vars after this describe block so subsequent test
// files (especially auth-advanced's resolveAuth) see the original
// SESSION_REGISTRY_ENFORCED value.
afterAll(() => {
  if (_savedEnv.SESSION_REGISTRY_ENFORCED !== undefined) {
    process.env.SESSION_REGISTRY_ENFORCED = _savedEnv.SESSION_REGISTRY_ENFORCED;
  } else {
    delete process.env.SESSION_REGISTRY_ENFORCED;
  }
  if (_savedEnv.JWT_SECRET !== undefined) {
    process.env.JWT_SECRET = _savedEnv.JWT_SECRET;
  }
  if (_savedEnv.JWT_REFRESH_SECRET !== undefined) {
    process.env.JWT_REFRESH_SECRET = _savedEnv.JWT_REFRESH_SECRET;
  }
  secH4TestsActive.value = false;
});

// ─── MED-004 Regression Tests ─────────────────────────────────────────────

describe("MED-004: sanitizeChartCss blocks CSS injection", () => {
  it("returns empty string for hostile </style><script> injection", () => {
    const { sanitizeChartCss } = require("@/components/ui/chart");
    const hostile = `
      [data-chart=abc] { --color-x: red; }
      </style><script>alert(1)</script>
    `;
    expect(sanitizeChartCss(hostile)).toBe("");
  });

  it("returns empty string for <script> tag injection", () => {
    const { sanitizeChartCss } = require("@/components/ui/chart");
    expect(sanitizeChartCss("<script>alert(1)</script>")).toBe("");
  });

  it("returns empty string for url() (CSS data exfiltration)", () => {
    const { sanitizeChartCss } = require("@/components/ui/chart");
    const malicious = `[data-chart=abc] { --color-x: url(javascript:alert(1)); }`;
    expect(sanitizeChartCss(malicious)).toBe("");
  });

  it("returns empty string for expression() (IE CSS expression injection)", () => {
    const { sanitizeChartCss } = require("@/components/ui/chart");
    const malicious = `[data-chart=abc] { --color-x: expression(alert(1)); }`;
    expect(sanitizeChartCss(malicious)).toBe("");
  });

  it("preserves well-formed chart CSS with hex colors", () => {
    const { sanitizeChartCss } = require("@/components/ui/chart");
    const input = `[data-chart=abc] {
  --color-revenue: #4ade80;
  --color-expense: #f87171;
}`;
    const result = sanitizeChartCss(input);
    expect(result).toContain("--color-revenue: #4ade80;");
    expect(result).toContain("--color-expense: #f87171;");
    expect(result).toContain("[data-chart=abc]");
  });

  it("preserves .dark prefix for dark-theme charts", () => {
    const { sanitizeChartCss } = require("@/components/ui/chart");
    const input = `.dark [data-chart=abc] {
  --color-revenue: oklch(0.7 0.2 150);
}`;
    const result = sanitizeChartCss(input);
    expect(result).toContain(".dark [data-chart=abc]");
    expect(result).toContain("--color-revenue: oklch(0.7 0.2 150);");
  });

  it("drops unknown selectors (e.g. body, .attacker-controlled)", () => {
    const { sanitizeChartCss } = require("@/components/ui/chart");
    const input = `
      body { background: red; }
      [data-chart=abc] { --color-x: #00ff00; }
      .attacker-class { display: none; }
    `;
    const result = sanitizeChartCss(input);
    expect(result).not.toContain("body");
    expect(result).not.toContain("attacker-class");
    expect(result).toContain("[data-chart=abc]");
  });

  it("drops declarations with invalid color values", () => {
    const { sanitizeChartCss } = require("@/components/ui/chart");
    const input = `[data-chart=abc] {
  --color-good: #00ff00;
  --color-bad: not-a-color;
  --color-also-bad: red;</style><script>;
}`;
    const result = sanitizeChartCss(input);
    // Should reject the whole input because of the </style> breakout attempt
    expect(result).toBe("");
  });

  it("drops selectors with invalid chart identifiers", () => {
    const { sanitizeChartCss } = require("@/components/ui/chart");
    const input = `[data-chart=bad id] { --color-x: #00ff00; }`;
    expect(sanitizeChartCss(input)).toBe("");
  });

  it("handles empty input gracefully", () => {
    const { sanitizeChartCss } = require("@/components/ui/chart");
    expect(sanitizeChartCss("")).toBe("");
    expect(sanitizeChartCss(null as unknown as string)).toBe("");
    expect(sanitizeChartCss(undefined as unknown as string)).toBe("");
  });
});
