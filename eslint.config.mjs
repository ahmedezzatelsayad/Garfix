import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ═══════════════════════════════════════════════════════════════════════════
// Progressive ESLint Rule Enablement — P3
// ═══════════════════════════════════════════════════════════════════════════
// History (P0-13, Engineering Audit): the audit flagged this config as
// Critical because it disabled ~30 TypeScript and React safety rules. The P0
// remediation sprint deferred re-enabling them so it wouldn't generate
// hundreds of errors in a single shot. This file implements that deferred
// work as a PHASED rollout — a batch of rules per sprint — so the codebase
// can converge without breaking CI.
//
// CI behavior: `.github/workflows/ci.yml` fails ONLY on ESLint *errors*
// (warnings never fail the build). Each phase therefore enables its rules at
// the strongest level that is believed to already be clean; riskier rules
// start at "warn" and are promoted to "error" in a later phase once their
// violations are fixed.
//
// ── Phase 1 (this commit) ─────────────────────────────────────────────────
//   error: no-debugger                    — never valid in committed code
//   warn:  no-unreachable, no-fallthrough, no-case-declarations,
//          no-useless-escape, no-console, prefer-const
//          — surface existing debt without failing CI
//
// ── Phase 2 (follow-up sprint) ────────────────────────────────────────────
//   Promote Phase 1 warnings → error once each hits 0 violations. Then
//   tackle @typescript-eslint/no-unused-vars (with argsIgnorePattern "^_").
//
// ── Phase 3 (after that) ──────────────────────────────────────────────────
//   @typescript-eslint/no-explicit-any, ban-ts-comment, and
//   react-hooks/exhaustive-deps — each needs a dedicated cleanup pass.
//
// The P0 Critical security fixes (SSRF, JWT, auth, schema drift, rate-limit,
// code-split, Account.id validators) were applied in the P0 sprint and are
// unaffected by this phased lint rollout.
// ═══════════════════════════════════════════════════════════════════════════

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // ── TypeScript rules ────────────────────────────────────────────────────
    // Phase 3 candidates — each needs a dedicated cleanup pass (see header).
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    "@typescript-eslint/no-require-imports": "off",

    // ── React rules ─────────────────────────────────────────────────────────
    // exhaustive-deps is a Phase 3 candidate — it needs careful per-component
    // review to avoid introducing stale-closure regressions.
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react-hooks/set-state-in-effect": "off",
    "react-hooks/error-boundaries": "off",
    "react-hooks/immutability": "off",
    "react-hooks/static-components": "off",
    "react-hooks/preserve-manual-memoization": "off",
    "react-hooks/refs": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // ── Next.js rules ───────────────────────────────────────────────────────
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // ── General JavaScript rules ────────────────────────────────────────────
    // Phase 1 (P3): enabled. "error" only for the rule we are confident is
    // already clean; the rest start at "warn" and are promoted in Phase 2.
    "no-debugger": "error",           // Phase 1 → error (never valid in prod code)
    "no-unreachable": "warn",         // Phase 1 → warn
    "no-fallthrough": "warn",         // Phase 1 → warn
    "no-case-declarations": "warn",   // Phase 1 → warn
    "no-useless-escape": "warn",      // Phase 1 → warn
    "no-console": "warn",             // Phase 1 → warn (prefer src/lib/logger)
    "prefer-const": "warn",           // Phase 1 → warn
    // Still deferred to Phase 2/3:
    "no-unused-vars": "off",          // superseded by @typescript-eslint/no-unused-vars
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills"]
}];

export default eslintConfig;
