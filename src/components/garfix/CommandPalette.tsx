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
      className="fixed inset-0 z-[9999] bg-[rgba(8,8,16,0.55)] backdrop-blur-[6px] flex items-start justify-center pt-[8vh] px-4 pb-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[min(640px,100%)] max-h-[70vh] flex flex-col rounded-2xl overflow-hidden border border-white/[0.08] bg-[linear-gradient(180deg,#1a1a2e_0%,#16162a_60%,#12121f_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_0_1px_rgba(124,58,237,0.18)] text-[#f5f5fa] font-[inherit]"
      >
        {/* Search input */}
        <div
          className="flex items-center gap-[10px] py-[14px] px-4 border-b border-white/[0.06] bg-[rgba(124,58,237,0.06)]"
        >
          <Search size={18} className="text-[#a78bfa] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={onKeyDown}
            placeholder="ابحث عن صفحة، إجراء، فاتورة أو عميل… (مثال: فوا)"
            className="flex-1 bg-transparent border-none outline-none text-[#f5f5fa] text-[15px] font-[inherit] [direction:rtl]"
          />
          <button
            onClick={onClose}
            title="إغلاق (Esc)"
            className="bg-white/[0.06] border-none text-[#9ca3af] cursor-pointer rounded-md p-1 flex items-center"
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="overflow-y-auto flex-1 p-[6px] garfix-scroll"
        >
          {loading && (
            <div className="p-5 text-center text-[13px] text-[#9ca3af]">
              جارٍ البحث…
            </div>
          )}

          {!loading && isEmpty && (
            <div className="py-8 px-5 text-center text-[#9ca3af]">
              <Search size={28} className="opacity-40 mb-2" />
              <div className="text-[13px]">
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
              <div key={section} className="mb-1">
                <div
                  className="pt-2 px-3 pb-1 text-[10px] font-extrabold text-[#7c3aed] uppercase tracking-[0.6px]"
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
                      className={`w-full flex items-center gap-[10px] py-[9px] px-3 rounded-[10px] ${isSelected ? "bg-[rgba(124,58,237,0.18)]" : "bg-transparent"} border-none font-[inherit] text-[13px] cursor-pointer text-right transition-[background_120ms_ease] ${isSelected ? "text-[#f5f5fa]" : "text-[#cbd5e1]"}`}
                    >
                      <Icon size={15} className={`shrink-0 ${isSelected ? "text-[#a78bfa]" : "text-[#6b7280]"}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`font-semibold truncate ${r.section === "invoices" ? "[direction:ltr] text-left font-mono" : "text-right font-[inherit]"}`}>
                          {r.label}
                        </div>
                        {r.sublabel && (
                          <div className="text-[11px] text-[#9ca3af] truncate">
                            {r.sublabel}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <CornerDownLeft size={13} className="text-[#a78bfa] shrink-0" />
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
          className="py-2 px-[14px] border-t border-white/[0.06] bg-[rgba(0,0,0,0.2)] flex items-center justify-between text-[10px] text-[#6b7280] gap-2 flex-wrap"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Kbd><ArrowUp size={9} /><ArrowDown size={9} /></Kbd>
              تنقل
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>Enter</Kbd>
              اختيار
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>Esc</Kbd>
              إغلاق
            </span>
          </div>
          <span className="text-[#7c3aed] font-bold">GarfiX ⌘K</span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="bg-white/[0.08] border border-white/[0.12] rounded py-[1px] px-[5px] text-[10px] font-mono text-[#cbd5e1] inline-flex items-center gap-[2px] min-w-[16px] justify-center"
    >
      {children}
    </kbd>
  );
}

export default CommandPalette;
