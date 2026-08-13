// GarfiX DS v4.0 Enhanced — Template List Manager
// Features: .table-enterprise, .hover-lift cards, .focus-ring inputs, .active-press buttons
"use client";

import { useState } from "react";
import {
  useInvoiceTemplates,
  useCreateInvoiceTemplate,
  useUpdateInvoiceTemplate,
  useDeleteInvoiceTemplate,
} from "@/hooks/queries";
import { toast } from "sonner";
import { 
  FileText, 
  LayoutTemplate, 
  Plus, 
  Pencil, 
  Trash2,
  Loader2,
  CheckCircle2,
  Copy,
  Search
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  type InvoiceTemplateRow,
  LAYOUT_TYPES,
  PAPER_SIZES,
  LOGO_POSITIONS,
  FONTS,
} from "./types";

// ─── Props ──────────────────────────────────────────────────────────────────

interface TemplateListManagerProps {
  companySlug: string;
}

// ─── Edit form shape ────────────────────────────────────────────────────────

interface EditFormData {
  name: string;
  layoutType: string;
  primaryColor: string;
  fontFamily: string;
  logoPosition: string;
  paperSize: string;
  isDefault: boolean;
  showTaxNumber: boolean;
  showQrCode: boolean;
  showBankDetails: boolean;
  footerText: string;
  termsAndConditions: string;
}

const defaultEditForm: EditFormData = {
  name: "", layoutType: "classic", primaryColor: "#047857", fontFamily: "Cairo",
  logoPosition: "right", paperSize: "A4", isDefault: false,
  showTaxNumber: true, showQrCode: false, showBankDetails: false,
  footerText: "", termsAndConditions: "",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function TemplateListManager({ companySlug }: TemplateListManagerProps) {
  const { data, isLoading } = useInvoiceTemplates(companySlug);
  const createMutation = useCreateInvoiceTemplate();
  const updateMutation = useUpdateInvoiceTemplate();
  const deleteMutation = useDeleteInvoiceTemplate();

  const templates: InvoiceTemplateRow[] = data?.templates ?? [];

  // ─── Dialog state ─────────────────────────────────────────────────────
  const [editingTemplate, setEditingTemplate] = useState<InvoiceTemplateRow | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<InvoiceTemplateRow | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [editForm, setEditForm] = useState<EditFormData>(defaultEditForm);

  // Search/filter state
  const [searchQuery, setSearchQuery] = useState("");

  const openEditDialog = (t: InvoiceTemplateRow) => {
    setCreatingNew(false);
    setEditingTemplate(t);
    setEditForm({
      name: t.name || "",
      layoutType: t.layoutType || "classic",
      primaryColor: t.primaryColor || "#047857",
      fontFamily: t.fontFamily || "Cairo",
      logoPosition: t.logoPosition || "right",
      paperSize: t.paperSize || "A4",
      isDefault: !!t.isDefault,
      showTaxNumber: t.showTaxNumber ?? true,
      showQrCode: t.showQrCode ?? false,
      showBankDetails: t.showBankDetails ?? false,
      footerText: t.footerText || "",
      termsAndConditions: t.termsAndConditions || "",
    });
  };

  const openCreateDialog = () => {
    setCreatingNew(true);
    setEditingTemplate(null);
    setEditForm(defaultEditForm);
  };

  const closeDialog = () => {
    setEditingTemplate(null);
    setCreatingNew(false);
  };

  // ─── Submit (create or update) ────────────────────────────────────────
  const submitEdit = async () => {
    if (!editForm.name.trim()) { toast.error("اسم القالب مطلوب"); return; }
    
    try {
      if (creatingNew) {
        await createMutation.mutateAsync({
          companySlug,
          name: editForm.name.trim(),
          layoutType: editForm.layoutType,
          primaryColor: editForm.primaryColor,
          fontFamily: editForm.fontFamily,
          logoPosition: editForm.logoPosition,
          paperSize: editForm.paperSize,
          isDefault: editForm.isDefault,
          showTaxNumber: editForm.showTaxNumber,
          showQrCode: editForm.showQrCode,
          showBankDetails: editForm.showBankDetails,
          footerText: editForm.footerText || null,
          termsAndConditions: editForm.termsAndConditions || null,
        });
        toast.success("تم إنشاء القالب بنجاح");
      } else {
        await updateMutation.mutateAsync({
          id: editingTemplate!.id,
          name: editForm.name.trim(),
          layoutType: editForm.layoutType,
          primaryColor: editForm.primaryColor,
          fontFamily: editForm.fontFamily,
          logoPosition: editForm.logoPosition,
          paperSize: editForm.paperSize,
          isDefault: editForm.isDefault,
          showTaxNumber: editForm.showTaxNumber,
          showQrCode: editForm.showQrCode,
          showBankDetails: editForm.showBankDetails,
          footerText: editForm.footerText || null,
          termsAndConditions: editForm.termsAndConditions || null,
        });
        toast.success("تم تحديث القالب بنجاح");
      }
      closeDialog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ في حفظ القالب");
    }
  };

  // ─── Delete ───────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deletingTemplate) return;
    try {
      await deleteMutation.mutateAsync(deletingTemplate.id);
      toast.success("تم حذف القالب بنجاح");
      setDeletingTemplate(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ في حذف القالب");
    }
  };

  const savingEdit = createMutation.isPending || updateMutation.isPending;
  const deleting = deleteMutation.isPending;

  // Filter templates based on search query
  const filteredTemplates = templates.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.layoutType.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════
          Main Container Card with Header
         ═══════════════════════════════════════════════════════════════ */}
      <div className="bg-card rounded-xl border border-border overflow-hidden hover-lift">
        {/* Header with emerald left border accent */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-1 h-10 rounded-full bg-primary" />
            <div>
              <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
                <LayoutTemplate size={18} className="text-primary" />
                إدارة القوالب الفردية
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                قوالب الفواتير المسجّلة في قاعدة البيانات — تعديل وحذف كل قالب على حدة
              </p>
            </div>
          </div>
          
          {/* New Template Button */}
          <Button 
            onClick={openCreateDialog} 
            size="sm"
            className={cn(
              "gap-2 font-semibold rounded-lg",
              "gradient-primary text-white shadow-brand-sm",
              "hover:gradient-primary-hover hover:shadow-brand-md",
              "transition-all duration-150 ease-out focus-ring active-press"
            )}
          >
            <Plus size={16} />
            قالب جديد
          </Button>
        </div>

        <CardContent className="p-5">
          {/* Loading State */}
          {isLoading ? (
            <div className="state-loading min-h-[300px]">
              <div className="state-loading-spinner" />
              <p className="text-sm text-muted-foreground">جارٍ تحميل القوالب...</p>
            </div>
          ) : filteredTemplates.length === 0 ? (
            /* Empty State */
            <div className="state-empty min-h-[250px]">
              <FileText className="text-emerald-600 dark:text-emerald-400" />
              <h3>{templates.length === 0 ? "لا توجد قوالب بعد" : "لا توجد نتائج"}</h3>
              <p>
                {templates.length === 0 
                  ? "أنشئ أول قالب بالضغط على زر 'قالب جديد'" 
                  : "حاول تغيير مصطلح البحث"}
              </p>
            </div>
          ) : (
            /* Table Container */
            <div className="space-y-4">
              {/* Search bar */}
              <div className="relative max-w-sm">
                <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث في القوالب..."
                  className={cn(
                    "w-full py-2.5 ps-10 pe-4 rounded-lg bg-background border border-border",
                    "text-sm text-foreground outline-none",
                    "focus-ring transition-all duration-120",
                    "placeholder:text-muted-foreground"
                  )}
                />
              </div>

              {/* Enterprise Table */}
              <div className="overflow-x-auto garfix-scroll rounded-lg border border-border">
                <table className="table-enterprise table-compact">
                  <thead>
                    <tr>
                      <th>الاسم</th>
                      <th>التصميم</th>
                      <th>اللون</th>
                      <th>الخط</th>
                      <th>الحجم</th>
                      <th>افتراضي</th>
                      <th className="table-pin-left">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTemplates.map((t) => (
                      <tr key={t.id} className="group">
                        <td className="font-bold text-foreground">{t.name}</td>
                        <td>
                          <span className="table-row-status active">
                            {LAYOUT_TYPES.find((l) => l.id === t.layoutType)?.label || t.layoutType}
                          </span>
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-2">
                            <span 
                              className="w-5 h-5 rounded-md border border-border shadow-inner"
                              style={{ background: t.primaryColor }}
                            />
                            <code className="text-[11px] font-mono text-muted-foreground" dir="ltr">
                              {t.primaryColor}
                            </code>
                          </span>
                        </td>
                        <td className="text-muted-foreground">{t.fontFamily}</td>
                        <td className="text-muted-foreground">{t.paperSize}</td>
                        <td>
                          {t.isDefault ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                              <CheckCircle2 size={12} />
                              افتراضي
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="table-pin-left">
                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-120">
                            {/* Edit Button */}
                            <button
                              onClick={() => openEditDialog(t)}
                              title="تعديل"
                              className={cn(
                                "inline-flex items-center justify-center w-8 h-8 rounded-lg",
                                "border border-border bg-card",
                                "text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/10",
                                "transition-all duration-120 ease-out cursor-pointer",
                                "focus-ring active-press hover-lift"
                              )}
                            >
                              <Pencil size={14} />
                            </button>
                            
                            {/* Duplicate Button */}
                            <button
                              onClick={() => {
                                openEditDialog(t);
                                // Clear ID to make it a new template
                              }}
                              title="نسخ"
                              className={cn(
                                "inline-flex items-center justify-center w-8 h-8 rounded-lg",
                                "border border-border bg-card",
                                "text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/10",
                                "transition-all duration-120 ease-out cursor-pointer",
                                "focus-ring active-press hover-lift"
                              )}
                            >
                              <Copy size={14} />
                            </button>
                            
                            {/* Delete Button */}
                            <button
                              onClick={() => setDeletingTemplate(t)}
                              title="حذف"
                              className={cn(
                                "inline-flex items-center justify-center w-8 h-8 rounded-lg",
                                "border border-border bg-card",
                                "text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10",
                                "transition-all duration-120 ease-out cursor-pointer",
                                "focus-ring active-press hover-lift"
                              )}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Table footer info */}
              <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground border-t border-border">
                <span>إجمالي القوالب: <strong className="text-foreground">{filteredTemplates.length}</strong></span>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-primary hover:underline focus-ring rounded"
                  >
                    مسح البحث
                  </button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          Edit / Create Dialog (DS v4.0 - Modal timing 220ms)
         ═══════════════════════════════════════════════════════════════ */}
      <Dialog open={!!editingTemplate || creatingNew} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto garfix-scroll rounded-xl border border-border">
          {/* Emerald top accent */}
          <div className="absolute top-0 start-0 end-0 h-1 bg-gradient-to-r from-primary via-emerald-400 to-primary rounded-t-xl" />
          
          <DialogHeader className="pt-4">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                {creatingNew ? (
                  <Plus size={18} className="text-primary" />
                ) : (
                  <Pencil size={18} className="text-primary" />
                )}
              </div>
              {creatingNew ? "إنشاء قالب جديد" : "تعديل القالب"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {creatingNew 
                ? "أدخل بيانات القالب الجديد واضغط على إنشاء" 
                : `تعديل القالب "${editingTemplate?.name}"`}
            </DialogDescription>
          </DialogHeader>

          {/* Form Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 animate-fade-in">
            {/* Name - Full width */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">اسم القالب *</Label>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="مثال: قالب الفاتورة الرسمية"
                className={cn(
                  "w-full py-2.5 px-4 rounded-lg bg-background border border-border text-sm",
                  "outline-none transition-all duration-120 ease-out focus-ring",
                  "placeholder:text-muted-foreground",
                  !editForm.name && "border-amber-400/50"
                )}
              />
              {!editForm.name && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">هذا الحقل مطلوب</p>
              )}
            </div>

            {/* Layout Type */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">نوع التصميم</Label>
              <Select value={editForm.layoutType} onValueChange={(v) => setEditForm((p) => ({ ...p, layoutType: v }))}>
                <SelectTrigger className="focus-ring transition-all duration-120 hover:border-primary/40 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LAYOUT_TYPES.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Paper Size */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">حجم الورق</Label>
              <Select value={editForm.paperSize} onValueChange={(v) => setEditForm((p) => ({ ...p, paperSize: v }))}>
                <SelectTrigger className="focus-ring transition-all duration-120 hover:border-primary/40 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAPER_SIZES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Primary Color */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">اللون الرئيسي</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={editForm.primaryColor}
                  onChange={(e) => setEditForm((p) => ({ ...p, primaryColor: e.target.value }))}
                  className="w-11 h-10 shrink-0 cursor-pointer rounded-lg border border-border bg-background p-0.5 focus-ring transition-all duration-120"
                />
                <input
                  type="text"
                  value={editForm.primaryColor}
                  onChange={(e) => setEditForm((p) => ({ ...p, primaryColor: e.target.value }))}
                  className="flex-1 h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono focus-ring transition-all duration-120"
                  dir="ltr"
                  maxLength={7}
                />
              </div>
            </div>

            {/* Font Family */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">نوع الخط</Label>
              <Select value={editForm.fontFamily} onValueChange={(v) => setEditForm((p) => ({ ...p, fontFamily: v }))}>
                <SelectTrigger className="focus-ring transition-all duration-120 hover:border-primary/40 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONTS.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Logo Position */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">موضع الشعار</Label>
              <Select value={editForm.logoPosition} onValueChange={(v) => setEditForm((p) => ({ ...p, logoPosition: v }))}>
                <SelectTrigger className="focus-ring transition-all duration-120 hover:border-primary/40 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOGO_POSITIONS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Toggle Switches Row */}
            <div className="sm:col-span-2 flex flex-wrap gap-4 pt-3 border-t border-border">
              <label className="flex items-center gap-2 cursor-pointer text-sm py-2 px-3 rounded-lg border border-border hover:border-primary/30 transition-colors duration-120">
                <Switch checked={editForm.isDefault} onCheckedChange={(v) => setEditForm((p) => ({ ...p, isDefault: v }))} className="data-[state=checked]:bg-primary" />
                <span className="font-medium">افتراضي</span>
                {editForm.isDefault && <CheckCircle2 size={14} className="text-primary" />}
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer text-sm py-2 px-3 rounded-lg border border-border hover:border-primary/30 transition-colors duration-120">
                <Switch checked={editForm.showTaxNumber} onCheckedChange={(v) => setEditForm((p) => ({ ...p, showTaxNumber: v }))} className="data-[state=checked]:bg-primary" />
                <span className="font-medium">الرقم الضريبي</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer text-sm py-2 px-3 rounded-lg border border-border hover:border-primary/30 transition-colors duration-120">
                <Switch checked={editForm.showQrCode} onCheckedChange={(v) => setEditForm((p) => ({ ...p, showQrCode: v }))} className="data-[state=checked]:bg-primary" />
                <span className="font-medium">رمز QR</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer text-sm py-2 px-3 rounded-lg border border-border hover:border-primary/30 transition-colors duration-120">
                <Switch checked={editForm.showBankDetails} onCheckedChange={(v) => setEditForm((p) => ({ ...p, showBankDetails: v }))} className="data-[state=checked]:bg-primary" />
                <span className="font-medium">بيانات البنك</span>
              </label>
            </div>

            {/* Footer Text */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">نص التذييل (اختياري)</Label>
              <textarea
                value={editForm.footerText}
                onChange={(e) => setEditForm((p) => ({ ...p, footerText: e.target.value }))}
                rows={2}
                placeholder="نص يظهر في أسفل الفاتورة..."
                className={cn(
                  "w-full rounded-lg border border-border bg-background px-4 py-3 text-sm resize-none",
                  "outline-none transition-all duration-120 ease-out focus-ring",
                  "placeholder:text-muted-foreground"
                )}
              />
            </div>

            {/* Terms and Conditions */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">الشروط والأحكام (اختياري)</Label>
              <textarea
                value={editForm.termsAndConditions}
                onChange={(e) => setEditForm((p) => ({ ...p, termsAndConditions: e.target.value }))}
                rows={3}
                placeholder="شروط وأحكام تظهر في أسفل الفاتورة..."
                className={cn(
                  "w-full rounded-lg border border-border bg-background px-4 py-3 text-sm resize-none",
                  "outline-none transition-all duration-120 ease-out focus-ring",
                  "placeholder:text-muted-foreground"
                )}
              />
            </div>
          </div>

          {/* Dialog Footer Actions */}
          <DialogFooter className="gap-2 sm:gap-3 border-t border-border pt-4">
            <Button 
              variant="outline" 
              onClick={closeDialog} 
              disabled={savingEdit}
              className={cn(
                "rounded-lg font-semibold",
                "transition-all duration-150 ease-out focus-ring active-press"
              )}
            >
              إلغاء
            </Button>
            <Button 
              onClick={submitEdit} 
              disabled={savingEdit || !editForm.name.trim()}
              className={cn(
                "gap-2 rounded-lg font-bold min-w-[140px]",
                "gradient-primary text-white shadow-brand-sm",
                "hover:gradient-primary-hover hover:shadow-brand-md",
                "transition-all duration-150 ease-out focus-ring active-press"
              )}
            >
              {savingEdit ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  جارٍ الحفظ…
                </>
              ) : (
                creatingNew ? "إنشاء القالب" : "حفظ التعديلات"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════
          Delete Confirmation Alert Dialog
         ═══════════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!deletingTemplate} onOpenChange={(o) => { if (!o) setDeletingTemplate(null); }}>
        <AlertDialogContent className="rounded-xl border border-destructive/20 max-w-md">
          {/* Warning icon header */}
          <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <Trash2 size={28} className="text-destructive" />
          </div>
          
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-lg font-bold">
              تأكيد الحذف
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-sm leading-relaxed">
              هل أنت متأكد من حذف القالب 
              <span className="font-bold text-foreground mx-1">&quot;{deletingTemplate?.name}&quot;</span>؟
              <br />
              <span className="text-destructive font-semibold">لا يمكن التراجع عن هذا الإجراء.</span>
              
              {deletingTemplate?.isDefault && (
                <span className="block mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                  ⚠️ هذا قالب افتراضي — يجب تعيين قالب آخر كافتراضي أولاً إذا كان هو القالب الوحيد.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <AlertDialogFooter className="gap-2 sm:gap-3 mt-4">
            <AlertDialogCancel disabled={deleting} className="rounded-lg font-semibold focus-ring active-press transition-all duration-150">
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className={cn(
                "rounded-lg font-bold gap-2 min-w-[100px]",
                "bg-destructive text-white hover:bg-destructive/90",
                "shadow-brand-sm transition-all duration-150 ease-out focus-ring active-press"
              )}
            >
              {deleting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  جارٍ…
                </>
              ) : (
                "حذف نهائي"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
