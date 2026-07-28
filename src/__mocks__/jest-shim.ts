/**
 * Jest compatibility shim for Bun test runner.
 *
 * Provides the `jest` global so that test files written with Jest mocking
 * conventions work under `bun test`.
 *
 * Uses a global override proxy for @/lib/db instead of Bun's mock.module()
 * to prevent module mock leaking across test files.
 *
 * Usage: add to bunfig.toml → [test] preload = ["./src/__mocks__/jest-shim.ts"]
 */

import { mock as bunMock } from "bun:test";

// ─── Mock registry (stores factory results for jest.requireMock) ──────────

const mockRegistry = new Map<string, any>();

// ─── Global db override ──────────────────────────────────────────────────

const globalForPrisma = globalThis as unknown as {
  __dbMockOverride: any | undefined;
};

// ─── jest.fn() ────────────────────────────────────────────────────────────

function jestFn(implementation?: (...args: any[]) => any) {
  const fn = implementation ? bunMock(implementation) : bunMock();
  return fn;
}

// ─── jest.mock() ──────────────────────────────────────────────────────────

function jestMock(modulePath: string, factory?: () => any) {
  if (factory) {
    const result = factory();
    mockRegistry.set(modulePath, result);

    // For @/lib/db, use the global override proxy instead of mock.module()
    // to prevent leaking across test files.
    if (modulePath === "@/lib/db" && result && result.db) {
      globalForPrisma.__dbMockOverride = result.db;
    } else {
      // For other modules, use mock.module() (these are less likely to leak)
      bunMock.module(modulePath, () => result);
    }
  } else {
    bunMock.module(modulePath, () => ({}));
  }
}

// ─── jest.requireMock() ──────────────────────────────────────────────────

function jestRequireMock(modulePath: string): any {
  if (mockRegistry.has(modulePath)) {
    return mockRegistry.get(modulePath);
  }
  // Fallback: try to require the module (Bun will return the mocked version)
  try {
    return require(modulePath);
  } catch {
    return {};
  }
}

// ─── jest.clearAllMocks() ────────────────────────────────────────────────

function jestClearAllMocks() {
  bunMock.clearAllMocks();
  // Also clear .mock.calls on all registered mock functions
  for (const [, mod] of mockRegistry) {
    if (mod && typeof mod === "object") {
      for (const val of Object.values(mod)) {
        if (val && typeof val === "object") {
          for (const fn of Object.values(val) as any[]) {
            if (typeof fn === "function" && typeof fn.mockClear === "function") {
              fn.mockClear();
            }
          }
        }
      }
    }
  }
}

// ─── jest.restoreAllMocks() ──────────────────────────────────────────────

function jestRestoreAllMocks() {
  bunMock.restore();
  mockRegistry.clear();
  // Clear the global db override so real Prisma is used again
  globalForPrisma.__dbMockOverride = undefined;
}

// ─── Assemble the jest global ─────────────────────────────────────────────

const jest = {
  fn: jestFn,
  mock: jestMock,
  requireMock: jestRequireMock,
  clearAllMocks: jestClearAllMocks,
  restoreAllMocks: jestRestoreAllMocks,
  // Stub methods that some tests may reference
  spyOn: () => bunMock(),
  useFakeTimers: () => {},
  useRealTimers: () => {},
  setSystemTime: () => {},
  advanceTimersByTime: () => {},
  runAllTimers: () => {},
  runOnlyPendingTimers: () => {},
  createMockFromModule: () => ({}),
  disableAutomock: () => {},
  enableAutomock: () => {},
  genMockFromModule: () => ({}),
  mocked: (m: any) => m,
  replaceProperty: () => ({ restore: () => {} }),
  setMock: () => {},
  unmock: () => {},
  doMock: () => {},
  dontMock: () => {},
};

// Expose as global
(globalThis as any).jest = jest;
