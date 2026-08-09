import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// P0-13 (Engineering Audit): The audit flagged this config as Critical
// because it disables ~30+ TypeScript and React safety rules. Re-enabling
// them in this P0 sprint would generate hundreds of errors across the
// codebase (the code was written assuming these rules are off), violating
// the "keep changes minimal" and "don't open huge modifications"
// constraints.
//
// The deferral is documented here so the next auditor knows this was a
// conscious decision. The audit's other Critical fixes (SSRF, JWT, auth,
// schema drift, rate-limit, code-split, Account.id validators) ARE applied.
// The ESLint rule re-enablement is scheduled for the follow-up TS-quality
// sprint where the offending sites can be fixed one rule at a time
// (progressive re-enablement, as the audit's own roadmap recommends).

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    "@typescript-eslint/no-require-imports": "off",
    
    // React rules
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
    
    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",
    
    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-useless-escape": "off",
    "no-debugger": "error",
    "no-unreachable": "error",
    "no-fallthrough": "error",
    "no-undef": "warn",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills"]
}];

export default eslintConfig;
