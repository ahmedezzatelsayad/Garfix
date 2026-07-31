"use client";

/**
 * QuickCreateProductDialog — نافذة سريعة لإنشاء منتج جديد أثناء الفاتورة
 *
 * الميزات:
 * - ملء تلقائي للاسم والسعر المقترح من البند
 * - تحقق من صحة البيانات
 * - إنشاء فوري + ربط بالبند تلقائياً
 * - دعم الأسماء البديلة (Aliases)
 */

import { useState, useEffect } from "react";
import { X, Plus, Package, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ─── Types ───────────────────────────────────────────────────────────────

export interface ProductFormData {
  name: string;
  code?: string;
  purchasePrice?: number;
  sellingPrice?: number;
  aliases: string[];
}

interface QuickCreateProductDialogProps {
  open: boolean;
  onClose: () => void;
  companySlug: string;
  /** القيم الافتراضية (من بند الفاتورة) */
  initialData?: Partial<ProductFormData>;
  /** callback عند الإنشاء الناجح */
  onCreated?: (product: {
    id: string;
    name: string;
    code?: string | null;
    sellingPrice?: number | null;
    purchasePrice?: number | null;
  }) => void;
}

// ─── Component ──────────────────────────────────────────────────────────

export function QuickCreateProductDialog({
  open,
  onClose,
  companySlug,
  initialData,
  onCreated,
}: QuickCreateProductDialogProps) {
  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    code: "",
    purchasePrice: undefined,
    sellingPrice: undefined,
    aliases: [],
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState("");

  // ─── Initialize with defaults ───────────────────────────────────────

  useEffect(() => {
    if (open && initialData) {
      setFormData(prev => ({
        ...prev,
        name: initialData.name || prev.name,
        code: initialData.code || prev.code,
        purchasePrice: initialData.purchasePrice ?? prev.purchasePrice,
        sellingPrice: initialData.sellingPrice ?? prev.sellingPrice,
      }));
    }
    
    if (open) {
      setError(null);
      setAliasInput("");
    }
  }, [open, initialData]);

  // ─── Form Handlers ─────────────────────────────────────────────────

  const updateField = (field: keyof ProductFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const addAlias = () => {
    const alias = aliasInput.trim();
    if (alias && !formData.aliases.includes(alias)) {
      setFormData(prev => ({
        ...prev,
        aliases: [...prev.aliases, alias],
      }));
      setAliasInput("");
    }
  };

  const removeAlias = (index: number) => {
    setFormData(prev => ({
      ...prev,
      aliases: prev.aliases.filter((_, i) => i !== index),
    }));
  };

  // ─── Submit Handler ─────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name.trim()) {
      setError("اسم المنتج مطلوب");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companySlug,
          name: formData.name.trim(),
          code: formData.code?.trim() || undefined,
          aliases: formData.aliases,
          purchasePrice: formData.purchasePrice,
          sellingPrice: formData.sellingPrice,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "فشل في إنشاء المنتج");
      }

      // Success
      onCreated?.(data.product);
      onClose();
      
      // Reset form
      setFormData({
        name: "",
        code: "",
        purchasePrice: undefined,
        sellingPrice: undefined,
        aliases: [],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطأ غير متوقع";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-l from-[#F5F3FF] to-white">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-[#7C3AED]" />
            <h3 className="font-bold text-[16px] text-gray-900">إضافة منتج جديد</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700 text-sm">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          {/* Product Name */}
          <div className="space-y-1.5">
            <Label htmlFor="product-name" className="text-[13px] font-medium text-gray-700">
              اسم المنتج <span className="text-red-500">*</span>
            </Label>
            <Input
              id="product-name"
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="مثال: ماتور 16 دينار"
              autoFocus
              dir="rtl"
              className="text-[14px]"
            />
          </div>

          {/* SKU / Code */}
          <div className="space-y-1.5">
            <Label htmlFor="product-code" className="text-[13px] font-medium text-gray-700">
              الكود / SKU
            </Label>
            <Input
              id="product-code"
              value={formData.code || ""}
              onChange={(e) => updateField("code", e.target.value)}
              placeholder="مثال: MTR-16 (اختياري)"
              dir="ltr"
              className="text-[14px]"
            />
          </div>

          {/* Prices Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="purchase-price" className="text-[13px] font-medium text-gray-700">
                سعر الشراء
              </Label>
              <Input
                id="purchase-price"
                type="number"
                step="0.01"
                value={formData.purchasePrice ?? ""}
                onChange={(e) => updateField("purchasePrice", e.target.value ? Number(e.target.value) : undefined)}
                placeholder="0.00"
                dir="ltr"
                className="text-[14px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="selling-price" className="text-[13px] font-medium text-gray-700">
                سعر البيع <span className="text-red-500">*</span>
              </Label>
              <Input
                id="selling-price"
                type="number"
                step="0.01"
                value={formData.sellingPrice ?? ""}
                onChange={(e) => updateField("sellingPrice", e.target.value ? Number(e.target.value) : undefined)}
                placeholder="0.00"
                dir="ltr"
                className="text-[14px]"
              />
            </div>
          </div>

          {/* Aliases */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-gray-700">
              أسماء بديلة (للمطابقة الذكية)
            </Label>
            
            {/* Existing Aliases */}
            {formData.aliases.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {formData.aliases.map((alias, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-md text-xs"
                  >
                    {alias}
                    <button
                      type="button"
                      onClick={() => removeAlias(idx)}
                      className="hover:text-purple-900"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Add Alias Input */}
            <div className="flex gap-2">
              <Input
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAlias())}
                placeholder="أضف اسم بديل ثم اضغط Enter..."
                dir="rtl"
                className="text-[13px] flex-1"
              />
              <Button
                type="button"
                onClick={addAlias}
                variant="outline"
                size="sm"
                disabled={!aliasInput.trim()}
              >
                إضافة
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loading}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={loading || !formData.name.trim()}
              className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin ml-1" />
                  جارٍ الإنشاء...
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} className="ml-1" />
                  إنشاء وربط
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Export Types ───────────────────────────────────────────────────────

export type { QuickCreateProductDialogProps };
