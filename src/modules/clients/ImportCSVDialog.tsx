"use client";

import { useState } from "react";
import { useCreateClient } from "@/hooks/queries";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportCSVDialogProps {
  companySlug: string;
  open: boolean;
  onClose: () => void;
}

const thSm = "text-start py-1.5 px-2 text-[10px] text-gray-500 font-bold";
const tdSm = "py-1.5 px-2 text-[12px]";

/** Parse a single CSV line — handles quoted fields with embedded commas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === ',') { out.push(cur.trim()); cur = ""; }
      else if (ch === '"') inQ = true;
      else cur += ch;
    }
  }
  out.push(cur.trim());
  // strip surrounding quotes from each cell
  return out.map((c) => c.replace(/^"|"$/g, ""));
}

export function ImportCSVDialog({ companySlug, open, onClose }: ImportCSVDialogProps) {
  const [parsed, setParsed] = useState<Array<{ name: string; email: string; phone: string; company: string; address: string }>>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);

  const createClient = useCreateClient();

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "").replace(/^\uFEFF/, "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length === 0) { toast.error("الملف فارغ"); return; }
      // First line is header — accept any order, but we expect columns:
      // name,email,phone,company,address
      const headerCells = lines[0].split(",").map((s) => s.trim().toLowerCase().replace(/^"|"$/g, ""));
      const idx = {
        name: headerCells.indexOf("name"),
        email: headerCells.indexOf("email"),
        phone: headerCells.indexOf("phone"),
        company: headerCells.indexOf("company"),
        address: headerCells.indexOf("address"),
      };
      const rows: Array<{ name: string; email: string; phone: string; company: string; address: string }> = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = parseCsvLine(lines[i]);
        const name = idx.name >= 0 ? cells[idx.name] : cells[0];
        if (!name) continue;
        rows.push({
          name,
          email: idx.email >= 0 ? cells[idx.email] || "" : "",
          phone: idx.phone >= 0 ? cells[idx.phone] || "" : "",
          company: idx.company >= 0 ? cells[idx.company] || "" : "",
          address: idx.address >= 0 ? cells[idx.address] || "" : "",
        });
      }
      setParsed(rows);
      toast.success(`تم تحليل ${rows.length} صف`);
    };
    reader.readAsText(f);
  };

  const runImport = async () => {
    if (parsed.length === 0) { toast.error("لا توجد بيانات للاستيراد"); return; }
    setImporting(true);
    let okCount = 0;
    let failCount = 0;
    for (const row of parsed) {
      try {
        await createClient.mutateAsync({
          name: row.name,
          email: row.email || undefined,
          phone: row.phone || undefined,
          company: row.company || undefined,
          address: row.address || undefined,
          companySlug,
        });
        okCount++;
      } catch {
        failCount++;
      }
    }
    setImporting(false);
    if (okCount > 0) toast.success(`تم استيراد ${okCount} عميل`);
    if (failCount > 0) toast.error(`تعذّر استيراد ${failCount} صف`);
    onClose();
  };

  if (!open) return null;

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/55 backdrop-blur-[4px] z-[1000] flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full md:max-w-[720px] max-h-[90vh] overflow-y-auto bg-white border border-gray-200 rounded-[16px] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.15)] garfix-scroll">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-[16px] font-extrabold flex items-center gap-2">
            <Upload size={18} /> استيراد عملاء من CSV
          </h2>
          <button onClick={onClose} className="bg-transparent border-none text-muted-foreground cursor-pointer p-1 max-md:min-w-[44px] max-md:min-h-[44px] flex items-center justify-center">
            <X size={18} />
          </button>
        </div>
        <div className="py-2.5 px-3 bg-gray-50 border border-gray-200 rounded-[10px] text-[11px] text-gray-500 mb-3">
          تنسيق الملف: عمود رأس باسم name,email,phone,company,address — ثم صف لكل عميل.
        </div>
        <input type="file" accept=".csv" onChange={onFile} className="mb-3 font-sans text-[12px]" />
        {fileName && (
          <div className="text-[11px] text-muted-foreground mb-2">الملف: {fileName}</div>
        )}
        {parsed.length > 0 && (
          <>
            <div className="text-[12px] font-bold mb-1.5">
              معاينة ({parsed.length} صف)
            </div>
            <div className="max-h-[280px] overflow-y-auto border border-gray-200 rounded-[8px] mb-3 garfix-scroll">
              <table className="w-full border-collapse text-[12px]">
                <thead><tr className="bg-gray-50 sticky top-0">
                  <th className={thSm}>الاسم</th><th className={thSm}>البريد</th><th className={thSm}>الهاتف</th><th className={thSm}>الشركة</th>
                </tr></thead>
                <tbody>
                  {parsed.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className={tdSm}>{r.name}</td>
                      <td className={cn(tdSm, "[direction:ltr] text-end")}>{r.email || "—"}</td>
                      <td className={cn(tdSm, "[direction:ltr] text-end")}>{r.phone || "—"}</td>
                      <td className={tdSm}>{r.company || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="flex gap-2.5 justify-end">
          <button onClick={onClose} className="py-2.5 px-5 rounded-[10px] bg-transparent text-gray-400 border border-gray-200 text-[13px] font-bold cursor-pointer max-md:min-h-[44px]">إلغاء</button>
          <button onClick={runImport} disabled={importing || parsed.length === 0} className="py-2.5 px-6 rounded-[10px] bg-[#7C3AED] text-white border-none text-[13px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 max-md:min-h-[44px] shadow-[0_2px_8px_rgba(124,58,237,0.3)]">
            {importing ? "جارٍ الاستيراد…" : `استيراد ${parsed.length} عميل`}
          </button>
        </div>
      </div>
    </div>
  );
}
