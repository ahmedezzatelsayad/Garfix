"use client";

import { useState, useEffect } from "react";
import { useBrand } from "@/context/BrandContext";
import { ClientList } from "./ClientList";
import { ClientForm } from "./ClientForm";
import { ImportCSVDialog } from "./ImportCSVDialog";
import { ClientProfile } from "./ClientProfile";
import type { Client } from "./types";

export function ClientsView() {
  const { activeCompany } = useBrand();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Listen for quick-action events from the Command Palette (e.g. "عميل جديد")
  useEffect(() => {
    const onQuickAction = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type?: string } | undefined;
      if (detail?.type === "new-client") {
        setEditing(null);
        setShowForm(true);
      }
    };
    window.addEventListener("garfix:quick-action", onQuickAction as EventListener);
    return () => window.removeEventListener("garfix:quick-action", onQuickAction as EventListener);
  }, []);

  if (!activeCompany) {
    return <div className="p-8 md:p-12 text-center text-muted-foreground">اختر شركة أولاً</div>;
  }

  // If a client is selected, show profile
  if (selectedClientId) {
    return <ClientProfile clientId={selectedClientId} onBack={() => setSelectedClientId(null)} />;
  }

  // If showing the form (create or edit), render it instead of the list
  if (showForm || editing) {
    return (
      <ClientForm
        companySlug={activeCompany.slug}
        client={editing}
        onClose={() => { setShowForm(false); setEditing(null); }}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-5">
      <ClientList
        companySlug={activeCompany.slug}
        onSelectClient={setSelectedClientId}
        onAddNew={() => { setEditing(null); setShowForm(true); }}
        onEdit={(client) => { setEditing(client); setShowForm(true); }}
        onImport={() => setShowImport(true)}
      />
      <ImportCSVDialog
        companySlug={activeCompany.slug}
        open={showImport}
        onClose={() => setShowImport(false)}
      />
    </div>
  );
}

export default ClientsView;
