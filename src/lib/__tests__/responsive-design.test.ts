/**
 * responsive-design.test.ts — Validates that key module source files
 * use responsive Tailwind breakpoints (sm:/md:/lg:/xl:) for
 * layout containers, grids, padding, text sizes, and visibility toggles.
 *
 * This is a static regex-based test that reads source files at build-time
 * and checks for responsive prefix patterns. It does NOT render components.
 */

import { describe, test, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

const MODULES_DIR = path.resolve(__dirname, "../../modules");
const COMPONENTS_DIR = path.resolve(__dirname, "../../components/garfix");

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function readSrc(relPath: string): string {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(MODULES_DIR, relPath);
  if (!fs.existsSync(fullPath)) return "";
  return fs.readFileSync(fullPath, "utf-8");
}

function readCompSrc(relPath: string): string {
  const fullPath = path.join(COMPONENTS_DIR, relPath);
  if (!fs.existsSync(fullPath)) return "";
  return fs.readFileSync(fullPath, "utf-8");
}

/* ─── Regex patterns ───────────────────────────────────────────────────── */

// Matches Tailwind responsive prefixes: sm:… md:… lg:… xl:
const responsivePrefixRe = /\b(sm|md|lg|xl):/g;

// Matches grid-cols-* without a responsive prefix before it (i.e. bare grid)
const bareGridRe = /className="[^"]*grid grid-cols-[0-9]+[^"]*"/g;

// Matches specific responsive patterns we expect
const responsiveGridRe = /\b(sm|md|lg|xl):grid-cols-/g;
const responsivePaddingRe = /\b(sm|md|lg|xl):p-/g;
const responsiveTextRe = /\b(sm|md|lg|xl):text-/g;
const responsiveHiddenRe = /\b(sm|md|lg|xl):hidden\b/g;
const responsiveBlockRe = /\b(sm|md|lg|xl):block\b/g;
const overflowXAutoRe = /overflow-x-auto/g;

/* ─── Module files to validate ─────────────────────────────────────────── */

interface FileCheck {
  label: string;
  relPath: string;
  src: string;
  readFn: (p: string) => string;
}

const MODULE_FILES: FileCheck[] = [
  { label: "DashboardView", relPath: "dashboard/DashboardView.tsx", src: "", readFn: readSrc },
  { label: "InvoicesView", relPath: "invoices/InvoicesView.tsx", src: "", readFn: readSrc },
  { label: "ClientsView", relPath: "clients/ClientsView.tsx", src: "", readFn: readSrc },
  { label: "CatalogView", relPath: "catalog/CatalogView.tsx", src: "", readFn: readSrc },
  { label: "InventoryView", relPath: "inventory/InventoryView.tsx", src: "", readFn: readSrc },
  { label: "PurchasesView", relPath: "purchases/PurchasesView.tsx", src: "", readFn: readSrc },
  { label: "HRView", relPath: "hr/HRView.tsx", src: "", readFn: readSrc },
  { label: "AccountingView", relPath: "accounting/AccountingView.tsx", src: "", readFn: readSrc },
  { label: "ReportsView", relPath: "reports/ReportsView.tsx", src: "", readFn: readSrc },
  { label: "AutomationView", relPath: "automation/AutomationView.tsx", src: "", readFn: readSrc },
  { label: "SettingsView", relPath: "settings/SettingsView.tsx", src: "", readFn: readSrc },
  { label: "TeamView", relPath: "team/TeamView.tsx", src: "", readFn: readSrc },
  { label: "BulkInputView", relPath: "bulk-input/BulkInputView.tsx", src: "", readFn: readSrc },
  { label: "PlatformAdminPanel", relPath: "admin/PlatformAdminPanel.tsx", src: "", readFn: readSrc },
  { label: "AppShell", relPath: "common/AppShell.tsx", src: "", readFn: readSrc },
  { label: "Sidebar", relPath: "common/Sidebar.tsx", src: "", readFn: readSrc },
  { label: "Topbar", relPath: "common/Topbar.tsx", src: "", readFn: readSrc },
  { label: "DataTable", relPath: "DataTable.tsx", src: "", readFn: readCompSrc },
];

/* ─── Test suite ───────────────────────────────────────────────────────── */

describe("Responsive Design Breakpoints", () => {
  // Pre-load all source files
  const sources: Map<string, string> = new Map();
  beforeAll(() => {
    for (const f of MODULE_FILES) {
      sources.set(f.label, f.readFn(f.relPath));
    }
  });

  // 1. Each module file should contain at least one responsive prefix
  test("each module file contains responsive prefixes (sm/md/lg/xl)", () => {
    const filesWithoutPrefix: string[] = [];
    for (const f of MODULE_FILES) {
      const src = sources.get(f.label) || "";
      if (!src) {
        // File doesn't exist — skip
        continue;
      }
      const matches = src.match(responsivePrefixRe);
      if (!matches || matches.length === 0) {
        filesWithoutPrefix.push(f.label);
      }
    }
    expect(filesWithoutPrefix).toHaveLength(0);
  });

  // 2. Key grid-based views should have responsive grid breakpoints
  test("grid layouts use responsive breakpoints (not bare grid-cols)", () => {
    const gridViews = [
      "DashboardView",
      "InvoicesView",
      "ReportsView",
      "InventoryView",
      "CatalogView",
    ];
    const failures: string[] = [];
    for (const label of gridViews) {
      const src = sources.get(label) || "";
      if (!src) continue;
      const responsiveGrids = src.match(responsiveGridRe);
      if (!responsiveGrids || responsiveGrids.length === 0) {
        failures.push(`${label}: no responsive grid breakpoints found`);
      }
    }
    expect(failures).toHaveLength(0);
  });

  // 3. Views with tables should use responsive hiding (hidden md:block or md:hidden)
  test("table views use responsive visibility toggles", () => {
    const tableViews = [
      "DashboardView",
      "InvoicesView",
      "CatalogView",
      "PurchasesView",
      "InventoryView",
      "HRView",
    ];
    const failures: string[] = [];
    for (const label of tableViews) {
      const src = sources.get(label) || "";
      if (!src) continue;
      const hiddenMatches = src.match(responsiveHiddenRe);
      const blockMatches = src.match(responsiveBlockRe);
      const total = (hiddenMatches?.length || 0) + (blockMatches?.length || 0);
      if (total === 0) {
        failures.push(`${label}: no responsive hidden/block patterns found`);
      }
    }
    expect(failures).toHaveLength(0);
  });

  // 4. Views should use responsive padding (p-3 md:p-5, etc.)
  test("views use responsive padding (sm/md/lg:p-)", () => {
    const paddingViews = [
      "DashboardView",
      "ReportsView",
      "AutomationView",
    ];
    const failures: string[] = [];
    for (const label of paddingViews) {
      const src = sources.get(label) || "";
      if (!src) continue;
      const matches = src.match(responsivePaddingRe);
      if (!matches || matches.length === 0) {
        failures.push(`${label}: no responsive padding breakpoints found`);
      }
    }
    expect(failures).toHaveLength(0);
  });

  // 5. Views should use responsive text sizes
  test("views use responsive text sizes (sm/md/lg:text-)", () => {
    const textViews = [
      "DashboardView",
      "InvoicesView",
      "HRView",
      "AccountingView",
    ];
    const failures: string[] = [];
    for (const label of textViews) {
      const src = sources.get(label) || "";
      if (!src) continue;
      const matches = src.match(responsiveTextRe);
      if (!matches || matches.length === 0) {
        failures.push(`${label}: no responsive text size breakpoints found`);
      }
    }
    expect(failures).toHaveLength(0);
  });

  // 6. DataTable should have overflow-x-auto for mobile
  test("DataTable uses overflow-x-auto for mobile table scrolling", () => {
    const src = sources.get("DataTable") || "";
    expect(src).toBeTruthy();
    const matches = src.match(overflowXAutoRe);
    expect(matches?.length || 0).toBeGreaterThanOrEqual(1);
  });

  // 7. AppShell main content area should have responsive padding
  test("AppShell uses responsive padding on main content", () => {
    const src = sources.get("AppShell") || "";
    expect(src).toBeTruthy();
    // Should have something like p-3 md:p-6 or p-4 md:p-6
    expect(src).toMatch(/p-[0-9]+\s+md:p-[0-9]+/);
  });

  // 8. Sidebar should have mobile/desktop toggle (md:translate-x-0 or md:hidden)
  test("Sidebar uses responsive mobile/desktop layout", () => {
    const src = sources.get("Sidebar") || "";
    expect(src).toBeTruthy();
    expect(src).toMatch(/md:translate-x-0/);
    expect(src).toMatch(/md:hidden/);
  });

  // 9. Topbar should have responsive layout elements
  test("Topbar uses responsive layout (md:hidden, sm:inline, md:px-)", () => {
    const src = sources.get("Topbar") || "";
    expect(src).toBeTruthy();
    expect(src).toMatch(/md:hidden/);
    expect(src).toMatch(/md:px-/);
  });

  // 10. Summary report: list which files have been updated
  test("summary: count responsive prefix occurrences per file", () => {
    const summary: Record<string, number> = {};
    for (const f of MODULE_FILES) {
      const src = sources.get(f.label) || "";
      if (!src) continue;
      const matches = src.match(responsivePrefixRe);
      summary[f.label] = matches?.length || 0;
    }
    // All files should have at least 1 responsive prefix
    const zeroFiles = Object.entries(summary).filter(([, count]) => count === 0);
    if (zeroFiles.length > 0) {
      console.warn("Files with zero responsive prefixes:", zeroFiles.map(([l]) => l));
    }
    // Log the summary for review
    console.log("\n── Responsive Prefix Summary ──");
    for (const [label, count] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${label}: ${count} responsive prefixes`);
    }
    console.log("── End Summary ──\n");

    // Every tracked file that exists should have responsive prefixes
    for (const [label, count] of Object.entries(summary)) {
      expect(count).toBeGreaterThan(0);
    }
  });
});
