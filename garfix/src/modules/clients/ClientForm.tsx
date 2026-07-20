"use client";

import { useState } from "react";
import { useCreateClient, useUpdateClient } from "@/hooks/queries";
import { toast } from "sonner";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Client } from "./types";

interface ClientFormProps {
  companySlug: string;
  client?: Client | null;
  onClose: () => void;
}

const inputStyle = "w-full py-2 px-3 rounded-sm bg-white border border-gray-200 text-foreground text-[13px] outline-none focus:border-[#7C3AED]/50 focus:ring-1 focus:ring-[#EDE9FE]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</label>
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="text-[22px] font-extrabold">{editing ? "تعديل عميل" : "عميل جديد"}</h1>
        <button onClick={onClose} className="bg-transparent border border-gray-200 text-gray-400 py-2 px-3 rounded-[8px] cursor-pointer text-[12px] inline-flex items-center gap-1 max-md:min-h-[44px]"><X size={14} /> إغلاق</button>
      </div>
      <div className="bg-white rounded-[14px] border border-gray-200 p-5 flex flex-col gap-3.5 shadow-card">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="الاسم"><input value={name} onChange={(e) => setName(e.target.value)} className={inputStyle} /></Field>
          <Field label="البريد الإلكتروني"><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputStyle} dir="ltr" /></Field>
          <Field label="الهاتف"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputStyle} dir="ltr" /></Field>
          <Field label="اسم الشركة"><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputStyle} /></Field>
        </div>
        <Field label="العنوان"><input value={address} onChange={(e) => setAddress(e.target.value)} className={inputStyle} /></Field>
        <Field label="ملاحظات"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={cn(inputStyle, "resize-y")} /></Field>
      </div>
      <div className="flex gap-2.5 justify-end">
        <button onClick={onClose} className="py-2.5 px-5 rounded-[10px] bg-transparent text-gray-400 border border-gray-200 text-[13px] font-bold cursor-pointer max-md:min-h-[44px]">إلغاء</button>
        <button onClick={submit} disabled={saving} className="py-2.5 px-6 rounded-[10px] bg-[#7C3AED] text-white border-none text-[13px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px] shadow-[0_2px_8px_rgba(124,58,237,0.3)]">{saving ? "جارٍ…" : "حفظ"}</button>
      </div>
    </div>
  );
}
