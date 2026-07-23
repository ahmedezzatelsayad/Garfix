"use client";

import { useState } from "react";
import {
  useInvoiceTemplates,
  useCreateInvoiceTemplate,
  useUpdateInvoiceTemplate,
  useDeleteInvoiceTemplate,
} from "@/hooks/queries";
import { toast } from "sonner";
import { FileText, LayoutTemplate, Plus, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
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
  name: "", layoutType: "classic", primaryColor: "#7c3aed", fontFamily: "Cairo",
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

  const openEditDialog = (t: InvoiceTemplateRow) => {
    setCreatingNew(false);
    setEditingTemplate(t);
    setEditForm({
      name: t.name || "",
      layoutType: t.layoutType || "classic",
      primaryColor: t.primaryColor || "#7c3aed",
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
    if (!editForm.name.trim()) { toast.error("الاسم مطلوب"); return; }
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
        toast.success("تم إنشاء القالب");
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
        toast.success("تم تحديث القالب");
      }
      closeDialog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    }
  };

  // ─── Delete ───────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deletingTemplate) return;
    try {
      await deleteMutation.mutateAsync(deletingTemplate.id);
      toast.success("تم حذف القالب");
      setDeletingTemplate(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    }
  };

  const savingEdit = createMutation.isPending || updateMutation.isPending;
  const deleting = deleteMutation.isPending;

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <LayoutTemplate size={18} className="text-primary" />
                إدارة القوالب الفردية
              </CardTitle>
              <CardDescription>
                قوالب الفواتير المسجّلة في قاعدة البيانات — تعديل وحذف كل قالب على حدة
              </CardDescription>
            </div>
            <Button onClick={openCreateDialog} size="sm" className="gap-1.5">
              <Plus size={14} /> قالب جديد
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">جارٍ التحميل…</div>
          ) : templates.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <FileText size={28} className="opacity-30" />
              <div>لا توجد قوالب فردية بعد — أنشئ أول قالب.</div>
            </div>
          ) : (
            <div className="overflow-x-auto garfix-scroll">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="text-start px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">الاسم</th>
                    <th className="text-start px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">التصميم</th>
                    <th className="text-start px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">اللون</th>
                    <th className="text-start px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">الخط</th>
                    <th className="text-start px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">الحجم</th>
                    <th className="text-start px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">افتراضي</th>
                    <th className="text-start px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id} className="border-b border-border hover:bg-muted/40">
                      <td className="px-3 py-2.5 font-bold">{t.name}</td>
                      <td className="px-3 py-2.5">{LAYOUT_TYPES.find((l) => l.id === t.layoutType)?.label || t.layoutType}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block w-4 h-4 rounded-full border border-border" style={{ background: t.primaryColor }} /* TAILWINDBREAK: dynamic template primary color */ />
                          <span className="font-mono text-[11px]" dir="ltr">{t.primaryColor}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs">{t.fontFamily}</td>
                      <td className="px-3 py-2.5 text-xs">{t.paperSize}</td>
                      <td className="px-3 py-2.5">
                        {t.isDefault ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500">
                            افتراضي
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openEditDialog(t)}
                            title="تعديل"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border hover:bg-primary/10 hover:border-primary/40 transition-colors cursor-pointer"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => setDeletingTemplate(t)}
                            title="حذف"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive transition-colors cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Edit / Create dialog ──────────────────────────────────────── */}
      <Dialog open={!!editingTemplate || creatingNew} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto garfix-scroll">
          <DialogHeader>
            <DialogTitle>{creatingNew ? "إنشاء قالب جديد" : "تعديل القالب"}</DialogTitle>
            <DialogDescription>
              {creatingNew ? "أدخل بيانات القالب الجديد." : `تعديل القالب "${editingTemplate?.name}"`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold text-muted-foreground">اسم القالب</Label>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="مثال: قالب الفاتورة الرسمية"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">نوع التصميم</Label>
              <Select value={editForm.layoutType} onValueChange={(v) => setEditForm((p) => ({ ...p, layoutType: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LAYOUT_TYPES.map((l) => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">حجم الورق</Label>
              <Select value={editForm.paperSize} onValueChange={(v) => setEditForm((p) => ({ ...p, paperSize: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAPER_SIZES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">اللون الرئيسي</Label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={editForm.primaryColor}
                  onChange={(e) => setEditForm((p) => ({ ...p, primaryColor: e.target.value }))}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border p-0.5"
                />
                <input
                  type="text"
                  value={editForm.primaryColor}
                  onChange={(e) => setEditForm((p) => ({ ...p, primaryColor: e.target.value }))}
                  className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm font-mono"
                  dir="ltr"
                  maxLength={7}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">نوع الخط</Label>
              <Select value={editForm.fontFamily} onValueChange={(v) => setEditForm((p) => ({ ...p, fontFamily: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONTS.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">موضع الشعار</Label>
              <Select value={editForm.logoPosition} onValueChange={(v) => setEditForm((p) => ({ ...p, logoPosition: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOGO_POSITIONS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 flex flex-wrap gap-3 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Switch checked={editForm.isDefault} onCheckedChange={(v) => setEditForm((p) => ({ ...p, isDefault: v }))} />
                <span>افتراضي</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Switch checked={editForm.showTaxNumber} onCheckedChange={(v) => setEditForm((p) => ({ ...p, showTaxNumber: v }))} />
                <span>إظهار الرقم الضريبي</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Switch checked={editForm.showQrCode} onCheckedChange={(v) => setEditForm((p) => ({ ...p, showQrCode: v }))} />
                <span>إظهار QR</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Switch checked={editForm.showBankDetails} onCheckedChange={(v) => setEditForm((p) => ({ ...p, showBankDetails: v }))} />
                <span>إظهار بيانات البنك</span>
              </label>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold text-muted-foreground">نص التذييل (اختياري)</Label>
              <textarea
                value={editForm.footerText}
                onChange={(e) => setEditForm((p) => ({ ...p, footerText: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold text-muted-foreground">الشروط والأحكام (اختياري)</Label>
              <textarea
                value={editForm.termsAndConditions}
                onChange={(e) => setEditForm((p) => ({ ...p, termsAndConditions: e.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={savingEdit}>
              إلغاء
            </Button>
            <Button onClick={submitEdit} disabled={savingEdit || !editForm.name.trim()} className="gap-1.5">
              {savingEdit ? "جارٍ الحفظ…" : (creatingNew ? "إنشاء" : "حفظ التعديلات")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirmation ───────────────────────────────────────── */}
      <AlertDialog open={!!deletingTemplate} onOpenChange={(o) => { if (!o) setDeletingTemplate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف القالب &quot;{deletingTemplate?.name}&quot;؟ لا يمكن التراجع عن هذا الإجراء.
              {deletingTemplate?.isDefault && (
                <span className="block mt-2 text-destructive font-semibold">
                  هذا قالب افتراضي — يجب تعيين قالب آخر كافتراضي أولاً إذا كان هو القالب الوحيد.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "جارٍ الحذف…" : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
