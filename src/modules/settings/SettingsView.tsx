"use client";

import { useBrand, type CompanyInfo } from "@/context/BrandContext";
import { CompanySettingsForm } from "./CompanySettingsForm";
import { TemplateSettingsForm } from "./TemplateSettingsForm";
import { TemplateListManager } from "./TemplateListManager";
import { Building2 } from "lucide-react";

interface SettingsViewProps {
  activeCompany: CompanyInfo | null;
  onUpdated: () => void;
}

export function SettingsView({ activeCompany, onUpdated }: SettingsViewProps) {
  if (!activeCompany) {
    return <div className="p-8 md:p-12 text-center text-muted-foreground">اختر شركة أولاً</div>;
  }

  return (
    <div className="flex flex-col gap-4 md:gap-[16px]">
      <div>
        <h1 className="text-xl md:text-2xl font-extrabold flex items-center gap-2">
          <Building2 size={20} /> إعدادات الشركة
        </h1>
        <p className="text-[13px] text-muted-foreground">{activeCompany.nameAr || activeCompany.name}</p>
      </div>
      <CompanySettingsForm activeCompany={activeCompany} onUpdated={onUpdated} />
      <TemplateSettingsForm companySlug={activeCompany.slug} />
      <TemplateListManager companySlug={activeCompany.slug} />
    </div>
  );
}

export default SettingsView;
