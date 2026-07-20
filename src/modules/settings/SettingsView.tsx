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
    return <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>اختر شركة أولاً</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <h1 style={{ fontSize: "24px", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
          <Building2 size={20} /> إعدادات الشركة
        </h1>
        <p style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>{activeCompany.nameAr || activeCompany.name}</p>
      </div>
      <CompanySettingsForm activeCompany={activeCompany} onUpdated={onUpdated} />
      <TemplateSettingsForm companySlug={activeCompany.slug} />
      <TemplateListManager companySlug={activeCompany.slug} />
    </div>
  );
}

export default SettingsView;
