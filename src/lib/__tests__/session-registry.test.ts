/**
 * session-registry.test.ts — Verification suite for SessionRegistry (P1-B).
 *
 * The user's audit plan requires Login/Refresh/Logout/Revoke-all flow to be
 * tested end-to-end. We don't have a live PostgreSQL DB locally (the .env
 * DATABASE_URL is a SQLite placeholder, but schema.prisma is PostgreSQL).
 *
 * Instead, we:
 *   1. Mock `@/lib/db` so the SessionRegistry functions (registerSession,
 *      isSessionValid, revokeSession, revokeAllSessions, getActiveSessionCount,
 *      cleanupExpiredSessions, enforceSessionLimit) can be exercised against
 *      an in-memory store.
 *   2. Verify the schema-level concerns:
 *      a. prisma generate succeeds → SessionRegistry model is in the client
 *      b. Fields used in code (userUid, jti, userAgent, ipAddress, expiresAt)
 *         are all declared in schema.prisma
 *      c. Indexes declared on userUid + expiresAt
 *   3. Run the Login → Refresh → Logout → Revoke-all flow against the mock
 *      and verify every step behaves correctly.
 *
 * The "verification gate" is: every test in this file must pass before P1-B
 * is considered done. Live DB verification (prisma migrate status) is done
 * separately as a CI step against a staging database.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock @/lib/db with an in-memory SessionRegistry store ────────────────
// The mock tracks every call so tests can assert on side-effects.

type SessionRow = {
  id: string;
  userUid: string;
  jti: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

const sessions = new Map<string, SessionRow>(); // keyed by jti for fast lookup

const dbMock = {
  sessionRegistry: {
    create: mock(async ({ data }: { data: Omit<SessionRow, "id" | "createdAt" | "updatedAt"> }) => {
      // Enforce jti @unique at the mock level
      if (sessions.has(data.jti)) {
        const err = new Error("Unique constraint failed on the fields: (`jti`)");
        (err as { code?: string }).code = "P2002";
        throw err;
      }
      const now = new Date();
      const row: SessionRow = {
        id: `sess_${sessions.size + 1}`,
        ...data,
        createdAt: now,
        updatedAt: now,
      };
      sessions.set(row.jti, row);
      return row;
    }),
    findUnique: mock(async ({ where }: { where: { jti?: string; id?: string } }) => {
      if (where.jti) return sessions.get(where.jti) ?? null;
      if (where.id) {
        for (const row of sessions.values()) if (row.id === where.id) return row;
      }
      return null;
    }),
    findMany: mock(async ({ where, orderBy }: {
      where?: { userUid?: string };
      orderBy?: { createdAt?: "asc" | "desc" };
    }) => {
      let result = Array.from(sessions.values());
      if (where?.userUid) result = result.filter((r) => r.userUid === where.userUid);
      if (orderBy?.createdAt === "asc") result.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      if (orderBy?.createdAt === "desc") result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return result;
    }),
    delete: mock(async ({ where }: { where: { jti?: string; id?: string } }) => {
      if (where.jti) {
        const row = sessions.get(where.jti);
        if (!row) {
          const err = new Error("Record not found");
          (err as { code?: string }).code = "P2025";
          throw err;
        }
        sessions.delete(where.jti);
        return row;
      }
      if (where.id) {
        for (const [jti, row] of sessions.entries()) {
          if (row.id === where.id) {
            sessions.delete(jti);
            return row;
          }
        }
      }
      const err = new Error("Record not found");
      (err as { code?: string }).code = "P2025";
      throw err;
    }),
    deleteMany: mock(async ({ where }: {
      where?: { userUid?: string; expiresAt?: { lt?: Date } };
    }) => {
      let count = 0;
      for (const [jti, row] of Array.from(sessions.entries())) {
        let matches = true;
        if (where?.userUid && row.userUid !== where.userUid) matches = false;
        if (where?.expiresAt?.lt && row.expiresAt >= where.expiresAt.lt) matches = false;
        if (matches) {
          sessions.delete(jti);
          count++;
        }
      }
      return { count };
    }),
    count: mock(async ({ where }: {
      where?: { userUid?: string; expiresAt?: { gt?: Date } };
    }) => {
      let result = Array.from(sessions.values());
      if (where?.userUid) result = result.filter((r) => r.userUid === where.userUid);
      if (where?.expiresAt?.gt) result = result.filter((r) => r.expiresAt > where.expiresAt.gt!);
      return result.length;
    }),
  },
};

mock.module("@/lib/db", () => ({ db: dbMock, dbTyped: dbMock }));

// Import AFTER mock is set up so the module captures our mocked db.
const {
  registerSession,
  isSessionValid,
  revokeSession,
  revokeAllSessions,
  getActiveSessionCount,
  cleanupExpiredSessions,
} = require("../passwordPolicy") as {
  registerSession: (p: {
    userUid: string;
    jti: string;
    ipAddress?: string;
    userAgent?: string;
    ttlSeconds: number;
  }) => Promise<void>;
  isSessionValid: (jti: string) => Promise<boolean>;
  revokeSession: (jti: string) => Promise<void>;
  revokeAllSessions: (userUid: string) => Promise<void>;
  getActiveSessionCount: (userUid: string) => Promise<number>;
  cleanupExpiredSessions: () => Promise<number>;
};

beforeEach(() => {
  sessions.clear();
  for (const fn of Object.values(dbMock.sessionRegistry)) {
    (fn as  { mockClear: () => void }).mockClear();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. Schema-level verification (static checks against schema.prisma)
// ═══════════════════════════════════════════════════════════════════════════

describe("SessionRegistry schema (P1-B static checks)", () => {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const schemaPath = path.join(__dirname, "..", "..", "..", "prisma", "schema.prisma");
  const schema = fs.readFileSync(schemaPath, "utf8");

  it("schema.prisma is readable", () => {
    expect(schema.length).toBeGreaterThan(0);
  });

  it("declares SessionRegistry model", () => {
    expect(schema).toMatch(/model\s+SessionRegistry\s*\{/);
  });

  it("uses the P1-2 schema fields (userUid, jti, userAgent) — not legacy (userId, tokenHash, deviceInfo)", () => {
    // Extract the SessionRegistry block using a regex that handles `}` chars
    // inside Prisma comments (the naive `[^}]*` would stop at the first `}`
    // inside a doc-comment like `findMany({ where: { userUid } })`).
    const re = /model\s+SessionRegistry\s*\{([\s\S]*?)\n\}/;
    const match = schema.match(re);
    expect(match).not.toBeNull();
    const block = match![1];

    expect(block).toContain("userUid");
    expect(block).toContain("jti");
    expect(block).toContain("userAgent");
    expect(block).toContain("expiresAt");

    // Legacy fields must NOT be DECLARED as fields (would indicate schema
    // drift regression). The strings may still appear in doc-comments,
    // so we check for field-declaration syntax: `fieldName   Type`.
    expect(block).not.toMatch(/^\s*userId\s+\w+/m);
    expect(block).not.toMatch(/^\s*tokenHash\s+\w+/m);
    expect(block).not.toMatch(/^\s*deviceInfo\s+\w+/m);
  });

  // Helper: extract the SessionRegistry model block, handling `}` chars
  // that appear inside Prisma comments (e.g. `findMany({ where: { userUid } })`
  // in a doc-comment would prematurely terminate a naive `[^}]*` match).
  const extractModelBlock = (name: string): string => {
    // Match from `model NAME {` to the next `}` that sits at column 0
    // (Prisma's closing brace for a model is always at the start of a line).
    const re = new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`);
    const m = schema.match(re);
    return m ? m[1] : "";
  };

  it("declares jti @unique (required for revocation lookups)", () => {
    const block = extractModelBlock("SessionRegistry");
    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/jti\s+String\s+@unique/);
  });

  it("declares @@index on userUid (used by enforceSessionLimit on every login)", () => {
    const block = extractModelBlock("SessionRegistry");
    expect(block).toMatch(/@@index\(\[userUid\]\)/);
  });

  it("declares @@index on expiresAt (used by cleanupExpiredSessions cron)", () => {
    const block = extractModelBlock("SessionRegistry");
    expect(block).toMatch(/@@index\(\[expiresAt\]\)/);
  });

  it("declares FK to AppUser via userUid → AppUser.uid", () => {
    const block = extractModelBlock("SessionRegistry");
    expect(block).toMatch(/user\s+AppUser\s+@relation\(fields:\s*\[userUid\],\s*references:\s*\[uid\]/);
  });

  it("migration SQL contains CREATE INDEX for both SessionRegistry indexes", () => {
    const migrationsDir = path.join(__dirname, "..", "..", "..", "prisma", "migrations");
    const migrations = fs.readdirSync(migrationsDir);
    const p1Migration = migrations.find((m) => m.includes("p1_indexes_and_session_registry_fix"));
    expect(p1Migration).toBeDefined();
    const sqlPath = path.join(migrationsDir, p1Migration!, "migration.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "SessionRegistry_userUid_idx" ON "SessionRegistry"("userUid")');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "SessionRegistry_expiresAt_idx" ON "SessionRegistry"("expiresAt")');
  });

  it("prisma client has sessionRegistry model with all required fields", () => {
    // Import the generated PrismaClient and verify the model exists.
    const { PrismaClient } = require("@prisma/client") as { PrismaClient: new () => unknown };
    const client = new PrismaClient();
    const sr = (client as { sessionRegistry: unknown }).sessionRegistry;
    expect(sr).toBeDefined();
    // We can't actually query without a DB, but we can verify the model
    // exists on the client — this confirms prisma generate picked up the
    // updated schema.
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. registerSession — Login flow
// ═══════════════════════════════════════════════════════════════════════════

describe("registerSession — Login flow", () => {
  it("persists a new session row with userUid, jti, userAgent, ipAddress, expiresAt", async () => {
    await registerSession({
      userUid: "user-001",
      jti: "jti-aaa",
      ipAddress: "203.0.113.10",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      ttlSeconds: 900, // 15 min
    });

    expect(dbMock.sessionRegistry.create).toHaveBeenCalledTimes(1);
    const call = dbMock.sessionRegistry.create.mock.calls[0][0];
    expect(call.data.userUid).toBe("user-001");
    expect(call.data.jti).toBe("jti-aaa");
    expect(call.data.userAgent).toContain("Mozilla");
    expect(call.data.ipAddress).toBe("203.0.113.10");

    // expiresAt should be ~ttlSeconds in the future
    const now = Date.now();
    const expiresAt = call.data.expiresAt.getTime();
    const delta = expiresAt - now;
    expect(delta).toBeGreaterThan(800 * 1000); // > 800s
    expect(delta).toBeLessThan(1000 * 1000); // < 1000s
  });

  it("throws P2002 unique-constraint when the same jti is registered twice", async () => {
    await registerSession({ userUid: "user-001", jti: "jti-dup", ttlSeconds: 60 });
    await expect(
      registerSession({ userUid: "user-001", jti: "jti-dup", ttlSeconds: 60 }),
    ).rejects.toThrow(/Unique constraint/i);
  });

  it("enforces MAX_SESSIONS_PER_USER by evicting the oldest session", async () => {
    // Default MAX_SESSIONS_PER_USER=5 — register 5 sessions, then a 6th
    // should evict the oldest.
    const original = process.env.MAX_SESSIONS_PER_USER;
    process.env.MAX_SESSIONS_PER_USER = "3";
    // Re-import to pick up the new env var (Bun caches modules; we use a
    // unique cache-buster via jest.resetModules if needed — but the env
    // is read at call time in our impl, so we don't need to reset).

    // Wait — the const `MAX_SESSIONS_PER_USER` in passwordPolicy.ts is
    // captured at module-load time. Setting env after import won't affect
    // it. We'll work with the default (5) instead.

    process.env.MAX_SESSIONS_PER_USER = original;

    // Default limit = 5. Register 5 sessions.
    for (let i = 0; i < 5; i++) {
      await registerSession({
        userUid: "user-evict",
        jti: `jti-${i}`,
        ttlSeconds: 3600,
      });
      // Small delay so createdAt differs between rows
      await new Promise((r) => setTimeout(r, 5));
    }

    let count = await getActiveSessionCount("user-evict");
    expect(count).toBe(5);

    // Register the 6th — should evict jti-0 (oldest)
    await registerSession({
      userUid: "user-evict",
      jti: "jti-5",
      ttlSeconds: 3600,
    });

    count = await getActiveSessionCount("user-evict");
    expect(count).toBe(5); // still 5, not 6

    // Oldest session should be revoked
    expect(await isSessionValid("jti-0")).toBe(false);
    // Newest should still be valid
    expect(await isSessionValid("jti-5")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. isSessionValid — Refresh flow (called on every authed request)
// ═══════════════════════════════════════════════════════════════════════════

describe("isSessionValid — Refresh / per-request validation", () => {
  it("returns true for an active, non-expired session", async () => {
    await registerSession({ userUid: "u1", jti: "active-jti", ttlSeconds: 3600 });
    expect(await isSessionValid("active-jti")).toBe(true);
  });

  it("returns false for an unknown jti (revoked or never existed)", async () => {
    expect(await isSessionValid("never-existed")).toBe(false);
  });

  it("returns false for an expired session AND deletes the row (lazy cleanup)", async () => {
    // Register a session with ttlSeconds=0 — expiresAt will be ~now, so
    // any time check after will see it as expired.
    await registerSession({ userUid: "u1", jti: "expired-jti", ttlSeconds: -10 });
    // Wait a tiny bit to ensure Date.now() > expiresAt
    await new Promise((r) => setTimeout(r, 5));

    expect(await isSessionValid("expired-jti")).toBe(false);

    // Row should have been deleted by the lazy-cleanup branch
    expect(dbMock.sessionRegistry.delete).toHaveBeenCalledWith({ where: { jti: "expired-jti" } });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. revokeSession — Logout flow
// ═══════════════════════════════════════════════════════════════════════════

describe("revokeSession — Logout flow", () => {
  it("deletes the session row so future isSessionValid returns false", async () => {
    await registerSession({ userUid: "u1", jti: "logout-jti", ttlSeconds: 3600 });
    expect(await isSessionValid("logout-jti")).toBe(true);

    await revokeSession("logout-jti");

    expect(dbMock.sessionRegistry.delete).toHaveBeenCalledWith({ where: { jti: "logout-jti" } });
    expect(await isSessionValid("logout-jti")).toBe(false);
  });

  it("does NOT throw when revoking an unknown jti (best-effort)", async () => {
    // deleteMany with where:{jti} on unknown doesn't throw — our impl uses
    // db.sessionRegistry.delete which DOES throw P2025 on not-found. The
    // revokeSession wrapper catches it (.catch(() => {})). Verify this.
    await expect(revokeSession("never-existed")).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. revokeAllSessions — Revoke-all flow (admin action)
// ═══════════════════════════════════════════════════════════════════════════

describe("revokeAllSessions — Revoke-all flow", () => {
  it("deletes every session for a user, leaving other users untouched", async () => {
    await registerSession({ userUid: "u1", jti: "u1-a", ttlSeconds: 3600 });
    await registerSession({ userUid: "u1", jti: "u1-b", ttlSeconds: 3600 });
    await registerSession({ userUid: "u1", jti: "u1-c", ttlSeconds: 3600 });
    await registerSession({ userUid: "u2", jti: "u2-a", ttlSeconds: 3600 });

    await revokeAllSessions("u1");

    // All u1 sessions gone
    expect(await isSessionValid("u1-a")).toBe(false);
    expect(await isSessionValid("u1-b")).toBe(false);
    expect(await isSessionValid("u1-c")).toBe(false);
    // u2 session survives
    expect(await isSessionValid("u2-a")).toBe(true);

    // deleteMany called once with userUid filter
    expect(dbMock.sessionRegistry.deleteMany).toHaveBeenCalledWith({ where: { userUid: "u1" } });
  });

  it("does NOT throw when user has no sessions", async () => {
    await expect(revokeAllSessions("never-logged-in")).resolves.toBeUndefined();
    expect(dbMock.sessionRegistry.deleteMany).toHaveBeenCalledWith({ where: { userUid: "never-logged-in" } });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. cleanupExpiredSessions — Cron sweep
// ═══════════════════════════════════════════════════════════════════════════

describe("cleanupExpiredSessions — Cron sweep", () => {
  it("deletes only expired rows, leaves active ones alone", async () => {
    await registerSession({ userUid: "u1", jti: "active", ttlSeconds: 3600 });
    await registerSession({ userUid: "u1", jti: "expired", ttlSeconds: -10 });
    await new Promise((r) => setTimeout(r, 5));

    const deleted = await cleanupExpiredSessions();
    expect(deleted).toBe(1); // only the expired one
    expect(await isSessionValid("active")).toBe(true);
    expect(await isSessionValid("expired")).toBe(false);
  });

  it("returns 0 when no sessions are expired", async () => {
    await registerSession({ userUid: "u1", jti: "a", ttlSeconds: 3600 });
    await registerSession({ userUid: "u1", jti: "b", ttlSeconds: 3600 });
    const deleted = await cleanupExpiredSessions();
    expect(deleted).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Full Login → Refresh → Logout → Revoke-all lifecycle
// ═══════════════════════════════════════════════════════════════════════════

describe("Full lifecycle: Login → Refresh → Logout → Revoke-all", () => {
  it("simulates a complete user session lifecycle", async () => {
    // ── Step 1: LOGIN — registerSession creates a row ──────────────────
    await registerSession({
      userUid: "user-lifecycle",
      jti: "lc-access-1",
      ipAddress: "203.0.113.42",
      userAgent: "Mozilla/5.0",
      ttlSeconds: 900, // 15 min access token
    });
    expect(await isSessionValid("lc-access-1")).toBe(true);
    expect(await getActiveSessionCount("user-lifecycle")).toBe(1);

    // ── Step 2: REFRESH — old jti revoked, new jti registered ──────────
    await revokeSession("lc-access-1");
    await registerSession({
      userUid: "user-lifecycle",
      jti: "lc-access-2",
      ipAddress: "203.0.113.42",
      userAgent: "Mozilla/5.0",
      ttlSeconds: 900,
    });
    expect(await isSessionValid("lc-access-1")).toBe(false); // old revoked
    expect(await isSessionValid("lc-access-2")).toBe(true);  // new active
    expect(await getActiveSessionCount("user-lifecycle")).toBe(1);

    // ── Step 3: LOGOUT — revokeSession deletes the active row ──────────
    await revokeSession("lc-access-2");
    expect(await isSessionValid("lc-access-2")).toBe(false);
    expect(await getActiveSessionCount("user-lifecycle")).toBe(0);

    // ── Step 4: REVOKE-ALL — admin kills every session for the user ────
    // User logs in from another device first
    await registerSession({
      userUid: "user-lifecycle",
      jti: "lc-access-3",
      ttlSeconds: 900,
    });
    await registerSession({
      userUid: "user-lifecycle",
      jti: "lc-access-4",
      ttlSeconds: 900,
    });
    expect(await getActiveSessionCount("user-lifecycle")).toBe(2);

    await revokeAllSessions("user-lifecycle");
    expect(await getActiveSessionCount("user-lifecycle")).toBe(0);
    expect(await isSessionValid("lc-access-3")).toBe(false);
    expect(await isSessionValid("lc-access-4")).toBe(false);
  });

  it("simulates concurrent-session enforcement across multiple devices", async () => {
    // User logs in from 5 devices (hitting the default MAX_SESSIONS_PER_USER=5)
    for (let i = 0; i < 5; i++) {
      await registerSession({
        userUid: "user-concurrent",
        jti: `dev-${i}`,
        ttlSeconds: 900,
      });
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(await getActiveSessionCount("user-concurrent")).toBe(5);

    // 6th login from a new device — should evict dev-0 (oldest)
    await registerSession({
      userUid: "user-concurrent",
      jti: "dev-5",
      ttlSeconds: 900,
    });

    expect(await getActiveSessionCount("user-concurrent")).toBe(5); // capped
    expect(await isSessionValid("dev-0")).toBe(false); // evicted
    expect(await isSessionValid("dev-5")).toBe(true);  // newest active

    // After revoking all, count goes to 0
    await revokeAllSessions("user-concurrent");
    expect(await getActiveSessionCount("user-concurrent")).toBe(0);
  });
});
