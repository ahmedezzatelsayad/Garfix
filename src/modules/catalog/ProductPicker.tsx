"use client";

/**
 * ProductPicker — منتقي منتجات مع Autocomplete للفواتير
 *
 * الميزات:
 * - بحث فوري مع debounce (300ms)
 * - عرض رصيد المخزون لكل منتج
 * - دعم إنشاء منتج جديد إذا لم يوجد
 * - عرض السعر تلقائياً عند الاختيار
 * - دعم لوحة المفاتيح (أسهم + Enter + Escape)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Plus, Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Types ───────────────────────────────────────────────────────────────

export interface ProductOption {
  id: string;
  name: string;
  code?: string | null;
  sellingPrice?: number | null;
  purchasePrice?: number | null;
  stockQty?: number; // رصيد المخزون المتاح
  aliases?: string[];
}

interface ProductPickerProps {
  companySlug: string;
  value?: ProductOption | null;
  onChange?: (product: ProductOption | null) => void;
  onDescriptionChange?: (description: string) => void; // للتحديث المتزامن
  placeholder?: string;
  disabled?: boolean;
  showStock?: boolean; // عرض رصيد المخزون
  showPrice?: boolean; // عرض السعر
  onCreateNew?: () => void; // callback لفتح نافذة الإنشاء السريع
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────

export function ProductPicker({
  companySlug,
  value,
  onChange,
  onDescriptionChange,
  placeholder = "🔍 ابحث عن منتج أو اكتب اسم جديد...",
  disabled = false,
  showStock = true,
  showPrice = true,
  onCreateNew,
  className,
}: ProductPickerProps) {
  const [query, setQuery] = useState(value?.name || "");
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Search Function ─────────────────────────────────────────────────

  const searchProducts = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setOptions([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        companySlug,
        search: searchQuery.trim(),
        limit: "10",
      });
      
      const res = await fetch(`/api/catalog?${params}`);
      if (!res.ok) throw new Error("فشل في البحث");
      
      const data = await res.json();
      const products: ProductOption[] = (data.products || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        code: p.code || p.sku,
        sellingPrice: p.sellingPrice ? Number(p.sellingPrice) : null,
        purchasePrice: p.purchasePrice ? Number(p.purchasePrice) : null,
        aliases: p.aliases || [],
      }));

      // جلب رصيد المخزون إذا كان مطلوباً
      if (showStock && products.length > 0) {
        try {
          const ids = products.map(p => p.id).join(",");
          const stockRes = await fetch(`/api/inventory?companySlug=${companySlug}&productIds=${ids}`);
          if (stockRes.ok) {
            const stockData = await stockRes.json();
            const stockMap = new Map((stockData.items || []).map((item: any) => [item.productId, item.qty]));
            products.forEach(p => {
              p.stockQty = (stockMap.get(p.id) as number) ?? 0;
            });
          }
        } catch {
          // تجاهل خطأ المخزون - ليس حرجاً
        }
      }

      setOptions(products);
    } catch (err) {
      console.error("[ProductPicker] Search error:", err);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [companySlug, showStock]);

  // ─── Debounced Search ────────────────────────────────────────────────

  useEffect(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    
    let timer: NodeJS.Timeout | undefined;
    
    if (query.length >= 2) {
      timer = setTimeout(() => {
        searchProducts(query);
        setIsOpen(true);
        setSelectedIndex(-1);
      }, 300);
      setDebounceTimer(timer);
    } else {
      setOptions([]);
      setIsOpen(false);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [query, searchProducts]);

  // ─── Click Outside Handler ───────────────────────────────────────────

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ─── Keyboard Navigation ─────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || options.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < options.length) {
          selectProduct(options[selectedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  };

  // ─── Select Product ──────────────────────────────────────────────────

  const selectProduct = (product: ProductOption) => {
    setQuery(product.name);
    setIsOpen(false);
    onChange?.(product);
    onDescriptionChange?.(product.name);
  };

  // ─── Clear Selection ─────────────────────────────────────────────────

  const clearSelection = () => {
    setQuery("");
    onChange?.(null);
    onDescriptionChange?.("");
    inputRef.current?.focus();
  };

  // ─── Stock Status Helper ─────────────────────────────────────────────

  const getStockStatus = (qty?: number) => {
    if (qty === undefined || qty === null) return { label: "غير معروف", color: "bg-gray-100 text-gray-600" };
    if (qty <= 0) return { label: "نفذت الكمية", color: "bg-red-100 text-red-700" };
    if (qty < 10) return { label: `متبقي ${qty}`, color: "bg-yellow-100 text-yellow-700" };
    return { label: `متوفر (${qty})`, color: "bg-green-100 text-green-700" };
  };

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Input Container */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onDescriptionChange?.(e.target.value);
          }}
          onFocus={() => {
            if (options.length > 0 || query.length >= 2) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "pr-9 pl-8",
            isOpen && "ring-2 ring-[#7C3AED] border-[#7C3AED]"
          )}
          dir="rtl"
        />

        {/* Clear Button */}
        {query && (
          <button
            type="button"
            onClick={clearSelection}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-64 overflow-y-auto">
          {loading && (
            <div className="p-3 text-center text-gray-500 text-sm">
              <span className="animate-spin inline-block mr-2">⏳</span>
              جارٍ البحث...
            </div>
          )}

          {!loading && options.length === 0 && query.length >= 2 && (
            <div className="p-2">
              {/* No Results + Create New Option */}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onCreateNew?.();
                }}
                className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-purple-50 text-[#7C3AED] transition-colors text-sm"
              >
                <Plus size={16} />
                <span>إضافة "{query}" كمنتج جديد</span>
              </button>
            </div>
          )}

          {!loading && options.map((option, idx) => {
            const stockStatus = getStockStatus(option.stockQty);
            const isSelected = idx === selectedIndex;
            
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => selectProduct(option)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-right text-sm transition-colors",
                  isSelected
                    ? "bg-[#F5F3FF] text-[#7C3AED]"
                    : "hover:bg-gray-50 text-gray-700"
                )}
              >
                {/* Icon */}
                <Package size={18} className={cn(
                  "flex-shrink-0",
                  isSelected ? "text-[#7C3AED]" : "text-gray-400"
                )} />

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{option.name}</div>
                  {option.code && (
                    <div className="text-xs text-gray-500">SKU: {option.code}</div>
                  )}
                </div>

                {/* Price & Stock */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {showPrice && option.sellingPrice != null && (
                    <Badge variant="secondary" className="text-xs font-mono">
                      {Number(option.sellingPrice).toFixed(2)}
                    </Badge>
                  )}
                  
                  {showStock && (
                    <Badge 
                      variant="outline" 
                      className={cn("text-xs", stockStatus.color)}
                    >
                      {stockStatus.label}
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected Value Display (hidden but accessible) */}
      {value && (
        <input type="hidden" name="productId" value={value.id} />
      )}
    </div>
  );
}

// ─── Export Types for reuse ────────────────────────────────────────────

export type { ProductPickerProps };
