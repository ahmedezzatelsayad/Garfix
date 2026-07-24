/**
 * queries — Barrel export for all React Query hooks.
 *
 * Import any hook from here: `import { useClients, useCreateInvoice } from "@/hooks/queries";`
 * This keeps consumer imports clean and allows future tree-shaking optimization.
 *
 * Note: useCommissions exists in both hr.ts and accounting.ts (different signatures).
 * Note: useInitiatePayment exists in both platform-admin.ts and accounting.ts.
 * For the accounting-specific variants, import directly from "./accounting".
 */
export * from "./auth";
export * from "./clients";
export * from "./invoices";
export * from "./settings";
export * from "./hr";
// accounting.ts exports are imported directly to avoid naming conflicts:
//   useCommissions (also in hr.ts), useInitiatePayment (also in platform-admin.ts)
export * from "./accounting";
export * from "./inventory";
export * from "./automation";
export * from "./ai";
export * from "./dashboard";
export * from "./platform-admin";
export * from "./founder-panel";
export * from "./product-matching";
export * from "./catalog";
export * from "./webhooks";
export * from "./onboarding";
