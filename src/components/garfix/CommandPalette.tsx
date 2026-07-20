"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Search, FileText, Users, LayoutDashboard, Package, ShoppingCart,
  UserCog, Calculator, BarChart3, Settings, Building2, Shield, History,
  Plus, Sparkles, User, CornerDownLeft, ArrowUp, ArrowDown, X, Boxes,
} from "lucide-react";
import { useBrand } from "@/context/BrandContext";
import { authedFetch } from "@/context/AuthContext";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

// ─── Navigation items ──────────────────────────────────────────────────────

interface NavItem {
  hash: string;
  label: string;
  labelEn: string;
  keywords: string[];
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
}

const NAV_ITEMS: NavItem[] = [
  { hash: "dash", label: "لوحة التحكم", labelEn: "Dashboard", keywords: ["dash", "لوحة", "تحكم", "رئيسية"], icon: LayoutDashboard },
  { hash: "invoices", label: "الفواتير", labelEn: "Invoices", keywords: ["invoices", "فوا", "فاتورة", "فواتير"], icon: FileText },
  { hash: "clients", label: "العملاء", labelEn: "Clients", keywords: ["clients", "عملاء", "عميل", "عمليل"], icon: Users },
  { hash: "catalog", label: "المنتجات", labelEn: "Catalog", keywords: ["catalog", "products", "منتجات", "منتج"], icon: Package },
  { hash: "inventory", label: "المخزون", labelEn: "Inventory", keywords: ["inventory", "مخزون", "مستودع", "مستودعات", "stock", "warehouse"], icon: Boxes },
  { hash: "purchases", label: "المشتريات", labelEn: "Purchases", keywords: ["purchases", "مشتريات", "شراء"], icon: ShoppingCart },
  { hash: "hr", label: "الموارد البشرية", labelEn: "HR", keywords: ["hr", "موارد", "بشرية", "موظفين", "رواتب"], icon: UserCog },
  { hash: "accounting", label: "المحاسبة", labelEn: "Accounting", keywords: ["accounting", "محاسبة", "قيود", "حسابات"], icon: Calculator },
  { hash: "reports", label: "التقارير", labelEn: "Reports", keywords: ["reports", "تقارير", "تقرير"], icon: BarChart3 },
  { hash: "bulk-input", label: "إدخال مجمع بالـ AI", labelEn: "Bulk Input", keywords: ["bulk", "إدخال", "مجمع", "ذكاء"], icon: Sparkles },
  { hash: "team", label: "فريقي", labelEn: "Team", keywords: ["team", "فريق", "فريقي"], icon: Users },
  { hash: "settings", label: "الإعدادات", labelEn: "Settings", keywords: ["settings", "إعدادات", "اعدادات"], icon: Settings },
  { hash: "account", label: "حسابي", labelEn: "Account", keywords: ["account", "حسابي", "حساب"], icon: User },
  { hash: "saas", label: "إدارة المنصة", labelEn: "SaaS", keywords: ["saas", "منصة", "إدارة"], icon: Building2 },
  { hash: "platform-admin", label: "إدارة المؤسس", labelEn: "Platform Admin", keywords: ["platform", "admin", "مؤسس", "إدارة"], icon: Shield },
  { hash: "audit", label: "سجل التدقيق", labelEn: "Audit", keywords: ["audit", "تدقيق", "سجل"], icon: History },
];

// ─── Quick actions ──────────────────────────────────────────────────────────

interface QuickAction {
  id: string;
  label: string;
  keywords: string[];
  hash: string;
  eventDetail: { type: string };
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "new-invoice",
    label: "فاتورة جديدة",
    keywords: ["فاتورة", "جديدة", "new", "invoice", "create", "إنشاء"],
    hash: "invoices",
    eventDetail: { type: "new-invoice" },
    icon: Plus,
  },
  {
    id: "new-client",
    label: "عميل جديد",
    keywords: ["عميل", "جديد", "new", "client", "create", "إنشاء"],
    hash: "clients",
    eventDetail: { type: "new-client" },
    icon: Plus,
  },
  {
    id: "bulk-input",
    label: "إدخال مجمع بالـ AI",
    keywords: ["إدخال", "مجمع", "ذكاء", "bulk", "ai"],
    hash: "bulk-input",
    eventDetail: { type: "open-bulk" },
    icon: Sparkles,
  },
];

// ─── Result types ───────────────────────────────────────────────────────────

type ResultSection = "navigation" | "actions" | "invoices" | "clients";

interface BaseResult {
  id: string;
  section: ResultSection;
  label: string;
  sublabel?: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  onSelect: () => void;
}

interface InvoiceHit { id: number; invoiceNumber: string; clientName: string; total?: string | number; status?: string; }
interface ClientHit { id: number; name: string; phone?: string | null; }

// ─── Component ──────────────────────────────────────────────────────────────

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { activeCompany } = useBrand();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [invoiceHits, setInvoiceHits] = useState<InvoiceHit[]>([]);
  const [clientHits, setClientHits] = useState<ClientHit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset internal state when the palette opens (render-time adjustment, no cascading render).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setInvoiceHits([]);
      setClientHits([]);
    }
  }

  // Focus input on next tick when palette opens (side effect kept in useEffect)
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // ─── Debounced search against API (only for >=2 chars) ───────────────────
  // Sync state adjustments when search conditions change (render-time, no cascading render).
  const searchQuery = query.trim();
  const searchActive = open && searchQuery.length >= 2 && !!activeCompany?.slug;
  const searchKey = `${open ? 1 : 0}|${searchQuery}|${activeCompany?.slug || ""}`;
  const [prevSearchKey, setPrevSearchKey] = useState(searchKey);
  if (searchKey !== prevSearchKey) {
    setPrevSearchKey(searchKey);
    if (!searchActive) {
      setInvoiceHits([]);
      setClientHits([]);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!searchActive || !activeCompany?.slug) return;
    const slug = activeCompany.slug;
    const q = searchQuery;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const [invRes, cliRes] = await Promise.all([
          authedFetch(`/api/invoices?companySlug=${encodeURIComponent(slug)}&search=${encodeURIComponent(q)}&limit=5`),
          authedFetch(`/api/clients?companySlug=${encodeURIComponent(slug)}&search=${encodeURIComponent(q)}`),
        ]);
        if (cancelled) return;
        const inv = invRes.ok ? await invRes.json() : { invoices: [] };
        const cli = cliRes.ok ? await cliRes.json() : { clients: [] };
        setInvoiceHits((inv.invoices || []).slice(0, 5));
        setClientHits((cli.clients || []).slice(0, 5));
      } catch {
        if (!cancelled) {
          setInvoiceHits([]);
          setClientHits([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [searchActive, searchQuery, activeCompany]);

  const navigate = useCallback((hash: string, eventDetail?: { type: string }) => {
    window.location.hash = hash;
    if (eventDetail) {
      // Dispatch after the hash change so the target view has mounted
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("garfix:quick-action", { detail: eventDetail }));
      }, 80);
    }
    onClose();
  }, [onClose]);

  // ─── Build the flat results list ─────────────────────────────────────────
  const results: BaseResult[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: BaseResult[] = [];

    // Navigation matches (empty query → show all)
    const navMatches = q.length === 0
      ? NAV_ITEMS
      : NAV_ITEMS.filter((n) =>
          n.label.toLowerCase().includes(q) ||
          n.labelEn.toLowerCase().includes(q) ||
          n.keywords.some((k) => k.toLowerCase().includes(q) || q.includes(k.toLowerCase())),
        );
    for (const n of navMatches) {
      out.push({
        id: `nav-${n.hash}`,
        section: "navigation",
        label: n.label,
        sublabel: n.labelEn,
        icon: n.icon,
        onSelect: () => navigate(n.hash),
      });
    }

    // Quick actions
    const actionMatches = q.length === 0
      ? QUICK_ACTIONS
      : QUICK_ACTIONS.filter((a) =>
          a.label.toLowerCase().includes(q) ||
          a.keywords.some((k) => k.toLowerCase().includes(q) || q.includes(k.toLowerCase())),
        );
    for (const a of actionMatches) {
      out.push({
        id: `act-${a.id}`,
        section: "actions",
        label: a.label,
        sublabel: "إجراء سريع",
        icon: a.icon,
        onSelect: () => navigate(a.hash, a.eventDetail),
      });
    }

    // Search hits (only when query has 2+ chars)
    if (q.length >= 2) {
      for (const inv of invoiceHits) {
        out.push({
          id: `inv-${inv.id}`,
          section: "invoices",
          label: inv.invoiceNumber,
          sublabel: inv.clientName,
          icon: FileText,
          onSelect: () => navigate("invoices"),
        });
      }
      for (const c of clientHits) {
        out.push({
          id: `cli-${c.id}`,
          section: "clients",
          label: c.name,
          sublabel: c.phone || "عميل",
          icon: Users,
          onSelect: () => navigate("clients"),
        });
      }
    }

    return out;
  }, [query, invoiceHits, clientHits, navigate]);

  // Clamp selection when results shrink (render-time adjustment, no cascading render).
  const [prevResultsLen, setPrevResultsLen] = useState(results.length);
  if (results.length !== prevResultsLen) {
    setPrevResultsLen(results.length);
    if (selectedIndex >= results.length) setSelectedIndex(0);
  }

  // Scroll selected item into view
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, open]);

  // ─── Keyboard navigation ─────────────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[selectedIndex];
      if (r) r.onSelect();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  // Group results by section for rendering
  const sectionLabels: Record<ResultSection, string> = {
    navigation: "التنقل",
    actions: "إجراءات سريعة",
    invoices: "الفواتير",
    clients: "العملاء",
  };
  const sectionOrder: ResultSection[] = ["navigation", "actions", "invoices", "clients"];

  let flatIdx = -1;
  const isEmpty = results.length === 0;

  return (
    <div
      dir="rtl"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(8, 8, 16, 0.55)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "8vh 16px 16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 100%)",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "16px",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
          background: "linear-gradient(180deg, #1a1a2e 0%, #16162a 60%, #12121f 100%)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(124,58,237,0.18)",
          color: "#f5f5fa",
          fontFamily: "inherit",
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "14px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(124,58,237,0.06)",
          }}
        >
          <Search size={18} style={{ color: "#a78bfa", flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={onKeyDown}
            placeholder="ابحث عن صفحة، إجراء، فاتورة أو عميل… (مثال: فوا)"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#f5f5fa",
              fontSize: "15px",
              fontFamily: "inherit",
              direction: "rtl",
            }}
          />
          <button
            onClick={onClose}
            title="إغلاق (Esc)"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "none",
              color: "#9ca3af",
              cursor: "pointer",
              borderRadius: "6px",
              padding: "4px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{
            overflowY: "auto",
            flex: 1,
            padding: "6px",
          }}
          className="garfix-scroll"
        >
          {loading && (
            <div style={{ padding: "20px", textAlign: "center", fontSize: "13px", color: "#9ca3af" }}>
              جارٍ البحث…
            </div>
          )}

          {!loading && isEmpty && (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#9ca3af" }}>
              <Search size={28} style={{ opacity: 0.4, marginBottom: "8px" }} />
              <div style={{ fontSize: "13px" }}>
                {query.trim().length === 0
                  ? "ابدأ بالكتابة للبحث أو اختر من القائمة"
                  : "لا توجد نتائج مطابقة"}
              </div>
            </div>
          )}

          {!loading && !isEmpty && sectionOrder.map((section) => {
            const sectionResults = results.filter((r) => r.section === section);
            if (sectionResults.length === 0) return null;
            return (
              <div key={section} style={{ marginBottom: "4px" }}>
                <div
                  style={{
                    padding: "8px 12px 4px",
                    fontSize: "10px",
                    fontWeight: 800,
                    color: "#7c3aed",
                    textTransform: "uppercase",
                    letterSpacing: "0.6px",
                  }}
                >
                  {sectionLabels[section]}
                </div>
                {sectionResults.map((r) => {
                  flatIdx += 1;
                  const idx = flatIdx;
                  const isSelected = idx === selectedIndex;
                  const Icon = r.icon;
                  return (
                    <button
                      key={r.id}
                      data-idx={idx}
                      onClick={() => r.onSelect()}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "9px 12px",
                        borderRadius: "10px",
                        background: isSelected ? "rgba(124,58,237,0.18)" : "transparent",
                        border: "none",
                        color: isSelected ? "#f5f5fa" : "#cbd5e1",
                        fontFamily: "inherit",
                        fontSize: "13px",
                        cursor: "pointer",
                        textAlign: "right",
                        transition: "background 120ms ease",
                      }}
                    >
                      <Icon size={15} style={{ color: isSelected ? "#a78bfa" : "#6b7280", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          direction: r.section === "invoices" ? "ltr" : "rtl",
                          textAlign: r.section === "invoices" ? "left" : "right",
                          fontFamily: r.section === "invoices" ? "monospace" : "inherit",
                        }}>
                          {r.label}
                        </div>
                        {r.sublabel && (
                          <div style={{
                            fontSize: "11px",
                            color: "#9ca3af",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                            {r.sublabel}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <CornerDownLeft size={13} style={{ color: "#a78bfa", flexShrink: 0 }} />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: "8px 14px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "10px",
            color: "#6b7280",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Kbd><ArrowUp size={9} /><ArrowDown size={9} /></Kbd>
              تنقل
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Kbd>Enter</Kbd>
              اختيار
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Kbd>Esc</Kbd>
              إغلاق
            </span>
          </div>
          <span style={{ color: "#7c3aed", fontWeight: 700 }}>GarfiX ⌘K</span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "4px",
        padding: "1px 5px",
        fontSize: "10px",
        fontFamily: "monospace",
        color: "#cbd5e1",
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
        minWidth: "16px",
        justifyContent: "center",
      }}
    >
      {children}
    </kbd>
  );
}

export default CommandPalette;
