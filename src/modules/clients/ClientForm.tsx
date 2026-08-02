"use client";

/**
 * ClientForm — Create/Edit client form (DS v4.0 Updated)
 *
 * Uses:
 *   - focus-right: for input fields (RTL support)
 *   - active-press: for buttons (150ms motion)
 *   - touch-target: for mobile (44px min height)
 */
import { useState } from "react";
import { useCreateClient, useUpdateClient } from "@/hooks/queries";
import { toast } from "sonner";
import { X, User, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Client } from "./types";

interface ClientFormProps {
  companySlug: string;
  client?: Client | null;
  onClose: () => void;
}

// DS v4.0 Input Style with focus-right
const inputStyle = "focus-right w-full py-2.5 px-3 rounded-xl bg-card border border-border text-foreground text-[13px] outline-none touch-target min-h-[44px] md:min-h-[unset] focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all duration-150";

// DS v4.0 Button Styles
const buttonPrimaryStyle = "active-press touch-target inline-flex items-center justify-center gap-1.5 py-2.5 px-6 rounded-xl bg-primary text-primary-foreground border-none text-[13px] font-extrabold cursor-pointer shadow-glow-primary hover-scale disabled:cursor-not-allowed disabled:opacity-70 transition-all duration-150 min-h-[44px] md:min-h-[unset]";

const buttonSecondaryStyle = "active-press touch-target inline-flex items-center justify-center gap-1.5 py-2.5 px-5 rounded-xl bg-transparent text-muted-foreground border border-border text-[13px] font-bold cursor-pointer hover:bg-muted hover:border-primary/20 hover:text-foreground hover-scale transition-all duration-120 min-h-[44px] md:min-h-[unset]";

const buttonIconStyle = "active-press touch-target inline-flex items-center justify-center gap-1.5 p-2 rounded-lg bg-transparent text-muted-foreground border border-border cursor-pointer hover:bg-muted hover:border-destructive/40 hover:text-destructive hover-scale transition-all duration-120 min-h-[44px] md:min-h-[unset]";

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}

export function ClientForm({ companySlug, client, onClose }: ClientFormProps) {
  const editing = client ?? null;
  const [name, setName] = useState(editing?.name || "");
  const [email, setEmail] = useState(editing?.email || "");
  const [phone, setPhone] = useState(editing?.phone || "");
  const [companyName, setCompanyName] = useState(editing?.company || "");
  const [address, setAddress] = useState(editing?.address || "");
  const [notes, setNotes] = useState(editing?.notes || "");

  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  const saving = createClient.isPending || updateClient.isPending;

  const submit = async () => {
    if (!name) { toast.error("الاسم مطلوب"); return; }

    try {
      if (editing) {
        await updateClient.mutateAsync({
          id: editing.id,
          name,
          email: email || undefined,
          phone: phone || undefined,
          company: companyName || undefined,
          address: address || undefined,
          notes: notes || undefined,
        });
        toast.success("تم التحديث");
      } else {
        await createClient.mutateAsync({
          name,
          email: email || undefined,
          phone: phone || undefined,
          company: companyName || undefined,
          address: address || undefined,
          notes: notes || undefined,
          companySlug,
        });
        toast.success("تم الإنشاء");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
    }
  };

  // Handle form submission on Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.target instanceof HTMLTextAreaElement === false) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="kpi-icon-sm bg-primary/10 text-primary">
            <User size={18} />
          </div>
          <div>
            <h1 className="text-[22px] font-extrabold text-foreground">
              {editing ? "تعديل عميل" : "عميل جديد"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {editing ? "تعديل بيانات العميل الحالية" : "إضافة عميل جديد للشركة"}
            </p>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className={buttonIconStyle}
          title="إغلاق"
        >
          <X size={14} /> 
          <span className="hidden sm:inline">إغلاق</span>
        </button>
      </div>

      {/* Form Card */}
      <div className="bg-card rounded-xl border border-border p-5 md:p-6 flex flex-col gap-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          <Field label="اسم العميل" required>
            <input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              className={inputStyle} 
              placeholder="أدخل اسم العميل"
              onKeyDown={handleKeyDown}
              autoFocus={!editing}
            />
          </Field>
          <Field label="البريد الإلكتروني">
            <input 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              className={cn(inputStyle, "[direction:ltr] text-end")} 
              dir="ltr"
              placeholder="email@example.com"
              type="email"
            />
          </Field>
          <Field label="الهاتف">
            <input 
              value={phone} 
              onChange={(e) => setPhone(e.target.value)} 
              className={cn(inputStyle, "[direction:ltr] text-end")} 
              dir="ltr"
              placeholder="+966 5XX XXX XXXX"
              type="tel"
            />
          </Field>
          <Field label="اسم الشركة">
            <input 
              value={companyName} 
              onChange={(e) => setCompanyName(e.target.value)} 
              className={inputStyle} 
              placeholder="اسم الشركة (اختياري)"
            />
          </Field>
        </div>
        
        <Field label="العنوان">
          <input 
            value={address} 
            onChange={(e) => setAddress(e.target.value)} 
            className={inputStyle} 
            placeholder="العنوان الكامل (اختياري)"
          />
        </Field>
        
        <Field label="ملاحظات">
          <textarea 
            value={notes} 
            onChange={(e) => setNotes(e.target.value)} 
            rows={3} 
            className={cn(inputStyle, "resize-y min-h-[100px]")}
            placeholder="أي ملاحظات إضافية عن هذا العميل..."
            maxLength={1000}
          />
          <div className="text-[10px] text-muted-foreground mt-1 text-start">
            {notes.length}/1000 حرف
          </div>
        </Field>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2.5 sm:justify-end">
        <button 
          onClick={onClose} 
          className={buttonSecondaryStyle}
        >
          إلغاء
        </button>
        <button 
          onClick={submit} 
          disabled={saving} 
          className={buttonPrimaryStyle}
        >
          {saving ? (
            <>
              <Loader2 size={14} className="animate-spin" /> 
              جارٍ الحفظ…
            </>
          ) : (
            <>
              <Save size={14} /> 
              حفظ
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default ClientForm;
