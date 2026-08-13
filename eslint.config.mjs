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
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'warn',
    'no-unreachable': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    '@next/next/no-img-element': 'warn',
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills"]
}];

export default eslintConfig;
