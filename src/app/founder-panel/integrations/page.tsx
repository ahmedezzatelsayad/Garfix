/**
 * Founder Panel Integrations Page
 *
 * A comprehensive integration management dashboard for GarfiX ERP.
 * Displays all available integrations grouped by category with:
 * - Status indicators (configured/not configured)
 * - Health check dots (green/red)
 * - Configure and Test Connection buttons
 * - Category grouping (Payments, Communications, Storage, AI, Analytics)
 *
 * Uses GarfiX DS v4.0 design tokens and components.
 */
"use client";

import React, { useState, useMemo } from "react";
import { toast } from "sonner";
import { 
  Plug, 
  RefreshCw, 
  Filter,
  Grid3x3,
  LayoutList,
  Search
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GarfixCard } from "@/components/garfix-ds/core/GarfixCard";
import { GarfixButton } from "@/components/garfix-ds/core/GarfixButton";
import { GarfixBadge } from "@/components/garfix-ds/core/GarfixBadge";
import { GarfixPageHeader } from "@/components/garfix-ds/layout/GarfixPageHeader";
import {
  usePlatformIntegrations,
  useUpdatePlatformIntegrations,
  useTestIntegration,
} from "@/hooks/queries/platform-admin";
import { IntegrationCard } from "./components/IntegrationCard";
import { TestConnectionModal } from "./components/TestConnectionModal";
import { ConfigureIntegrationModal } from "./components/ConfigureIntegrationModal";
import { INTEGRATION_META_FULL, CATEGORY_LABELS, type IntegrationCategory } from "@/lib/integrations/types";

// ─── Types ───────────────────────────────────────────────────────────────

interface _IntegrationWithMeta {
  id: string;
  type: string;
  name: string;
  description: string;
  category: string;
  status: "active" | "inactive" | "error";
  hasCredentials: boolean;
  credentialsLastUpdatedAt: string | null;
  isRegistered: boolean;
  lastTestAt?: string | null;
  config?: Record<string, unknown>;
}

// ─── View Mode ──────────────────────────────────────────────────────────

type ViewMode = "grid" | "list";

// ─── Main Page Component ─────────────────────────────────────────────────

export default function IntegrationsPage() {
  // Data fetching
  const integrationsQuery = usePlatformIntegrations();
  const updateMutation = useUpdatePlatformIntegrations();
  const testMutation = useTestIntegration();

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<IntegrationCategory | "all">("all");
  
  // Modal state
  const [configuringType, setConfiguringType] = useState<string | null>(null);
  const [testingType, setTestingType] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testResult, setTestResult] = useState<{ success: boolean; details?: string; error?: string } | null>(null);

  // Get raw data
  const rawData = integrationsQuery.data as Array<{
    type: string;
    name: string;
    description: string;
    hasCredentials: boolean;
    credentialsLastUpdatedAt: string | null;
    isRegistered: boolean;
  }> | undefined;

  // Enrich data with metadata
  const enrichedIntegrations = useMemo(() => {
    if (!rawData) return [];
    
    return rawData.map((item) => {
      const meta = INTEGRATION_META_FULL.find((m) => m.type === item.type);
      return {
        ...item,
        icon: meta?.icon || "🔌",
        category: meta?.category || "analytics",
        requiredFields: meta?.requiredFields || [],
        optionalFields: meta?.optionalFields || [],
      };
    });
  }, [rawData]);

  // Filter integrations
  const filteredIntegrations = useMemo(() => {
    let result = enrichedIntegrations;

    // Category filter
    if (selectedCategory !== "all") {
      result = result.filter((i) => i.category === selectedCategory);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(query) ||
          i.type.toLowerCase().includes(query) ||
          i.description.toLowerCase().includes(query)
      );
    }

    return result;
  }, [enrichedIntegrations, selectedCategory, searchQuery]);

  // Group by category
  const groupedIntegrations = useMemo(() => {
    const groups = new Map<IntegrationCategory, typeof filteredIntegrations>();
    
    filteredIntegrations.forEach((integration) => {
      const cat = integration.category as IntegrationCategory;
      if (!groups.has(cat)) {
        groups.set(cat, []);
      }
      groups.get(cat)!.push(integration);
    });

    return groups;
  }, [filteredIntegrations]);

  // Get current configuring integration meta
  const configuringMeta = useMemo(() => {
    if (!configuringType) return null;
    return INTEGRATION_META_FULL.find((m) => m.type === configuringType) || null;
  }, [configuringType]);

  // Get testing integration info
  const testingInfo = useMemo(() => {
    if (!testingType) return null;
    const item = enrichedIntegrations.find((i) => i.type === testingType);
    const meta = INTEGRATION_META_FULL.find((m) => m.type === testingType);
    if (!item && !meta) return null;
    return {
      name: item?.name || meta?.name || testingType,
      icon: meta?.icon || "🔌",
    };
  }, [testingType, enrichedIntegrations]);

  // Handlers
  const handleConfigure = (type: string) => {
    setConfiguringType(type);
  };

  const handleTestConnection = async (type: string) => {
    setTestingType(type);
    setTestStatus("testing");
    setTestResult(null);

    try {
      const result = await testMutation.mutateAsync({ type });
      
      if (result.success) {
        setTestStatus("success");
        setTestResult({
          success: true,
          details: (result.data as Record<string, unknown>)?.details as string || undefined,
        });
        toast.success("اختبار الاتصال ناجح ✓");
      } else {
        setTestStatus("error");
        setTestResult({
          success: false,
          error: result.error as string || "فشل الاتصال",
        });
        toast.error("فشل اختبار الاتصال");
      }
    } catch (err) {
      setTestStatus("error");
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : "خطأ غير معروف",
      });
      toast.error("حدث خطأ أثناء الاختبار");
    }
  };

  const handleDisconnect = async (type: string) => {
    try {
      await updateMutation.mutateAsync({ type, disconnect: true });
      toast.success("تم قطع اتصال التكامل بنجاح");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ في قطع الاتصال");
    }
  };

  const handleSaveConfig = async (type: string, credentials: Record<string, string>) => {
    try {
      await updateMutation.mutateAsync({ type, credentials });
      toast.success("تم حفظ بيانات الاعتماد (مشفّرة)");
      setConfiguringType(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ في الحفظ");
    }
  };

  const handleCloseTestModal = () => {
    setTestingType(null);
    setTestStatus("idle");
    setTestResult(null);
  };

  // Stats
  const stats = useMemo(() => {
    const total = enrichedIntegrations.length;
    const configured = enrichedIntegrations.filter((i) => i.hasCredentials).length;
    const categories = new Set(enrichedIntegrations.map((i) => i.category)).size;
    return { total, configured, categories };
  }, [enrichedIntegrations]);

  // Loading state
  if (integrationsQuery.isLoading) {
    return (
      <div className="min-h-screen bg-mutedackgroundackground p-6 md:p-8 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-primary/10 mx-auto flex items-center justify-center">
            <Plug className="h-6 w-6 text-primary animate-pulse" />
          </div>
          <p className="text-muted-foreground">جارٍ تحميل التكاملات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mutedackgroundackground">
      {/* Page Header */}
      <GarfixPageHeader
        title="إدارة التكاملات"
        subtitle="إدارة ومراقبة خدمات الطرف الثالث المتصلة بـ GarfiX ERP"
        actions={
          <GarfixButton
            variant="outline"
            size="sm"
            onClick={() => integrationsQuery.refetch()}
            leadingIcon={<RefreshCw size={14} className={integrationsQuery.isRefetching ? "animate-spin" : ""} />}
          >
            تحديث
          </GarfixButton>
        }
      />

      <div className="max-w-7xl mx-auto px-6 pb-12 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <GarfixCard variant="kpi" kpiColor="emerald" padding="md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي التكاملات</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-mutedmerald-500/10 flex items-center justify-center">
                <Plug className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
          </GarfixCard>

          <GarfixCard variant="kpi" kpiColor="blue" padding="md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">مُهيّأة</p>
                <p className="text-2xl font-bold text-blue-600">{stats.configured}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-mutedackgroundlue-500/10 flex items-center justify-center">
                <span className="text-lg">✓</span>
              </div>
            </div>
          </GarfixCard>

          <GarfixCard variant="kpi" kpiColor="purple" padding="md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">الفئات</p>
                <p className="text-2xl font-bold text-purple-600">{stats.categories}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Filter className="h-5 w-5 text-purple-500" />
              </div>
            </div>
          </GarfixCard>
        </div>

        {/* Filters Bar */}
        <GarfixCard padding="md">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث عن تكامل..."
                dir="rtl"
                className={cn(
                  "w-full pr-10 pl-4 py-2 rounded-lg border bg-mutedackgroundackground",
                  "text-sm transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary",
                  "border-border placeholder:text-muted-foreground"
                )}
              />
            </div>

            {/* Category Filters + View Toggle */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  onClick={() => setSelectedCategory("all")}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
                    selectedCategory === "all"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  الكل
                </button>
                
                {(Object.keys(CATEGORY_LABELS) as IntegrationCategory[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1",
                      selectedCategory === cat
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    <span>{CATEGORY_LABELS[cat].icon}</span>
                    <span className="hidden sm:inline">{CATEGORY_LABELS[cat].ar}</span>
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="w-px h-6 bg-mutedackgroundorder hidden sm:block" />

              {/* View Toggle */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    viewMode === "grid" ? "bg-mutedackgroundackground shadow-sm" : "hover:bg-mutedackgroundackground/50"
                  )}
                  title="عرض شبكي"
                >
                  <Grid3x3 size={16} />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    viewMode === "list" ? "bg-mutedackgroundackground shadow-sm" : "hover:bg-mutedackgroundackground/50"
                  )}
                  title="عرض قائمة"
                >
                  <LayoutList size={16} />
                </button>
              </div>
            </div>
          </div>
        </GarfixCard>

        {/* Integrations Grid/List */}
        {filteredIntegrations.length === 0 ? (
          <GarfixCard padding="lg" className="text-center py-12">
            <div className="space-y-4">
              <div className="text-4xl">🔍</div>
              <div>
                <p className="font-semibold text-card-foreground">لا توجد نتائج</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery
                    ? `لا توجد تكاملات تطابق "${searchQuery}"`
                    : `لا توجد تكاملات في فئة "${selectedCategory}"`}
                </p>
              </div>
              {(searchQuery || selectedCategory !== "all") && (
                <GarfixButton
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("all");
                  }}
                >
                  مسح الفلاتر
                </GarfixButton>
              )}
            </div>
          </GarfixCard>
        ) : viewMode === "grid" ? (
          /* Grid View — Grouped by Category */
          <div className="space-y-8">
            {Array.from(groupedIntegrations.entries()).map(([category, integrations]) => (
              <div key={category}>
                {/* Category Header */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xl">{CATEGORY_LABELS[category].icon}</span>
                  <h2 className="text-lg font-bold text-card-foreground">
                    {CATEGORY_LABELS[category].ar}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    ({integrations.length})
                  </span>
                  <div className="flex-1 h-px bg-mutedackgroundorder" />
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {integrations.map((integration) => (
                    <IntegrationCard
                      key={integration.type}
                      integration={integration}
                      onConfigure={handleConfigure}
                      onTestConnection={handleTestConnection}
                      onDisconnect={handleDisconnect}
                      isTesting={testMutation.isPending && testingType === integration.type}
                      testResult={
                        testResult && testingType === integration.type
                          ? testResult
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List View */
          <GarfixCard padding="none">
            <div className="divide-y divide-border">
              {filteredIntegrations.map((integration) => (
                <div
                  key={integration.type}
                  className="px-6 py-4 hover:bg-muted/30 transition-colors flex items-center gap-4"
                >
                  {/* Icon */}
                  <span className="text-2xl">{integration.icon}</span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-card-foreground truncate">
                        {integration.name}
                      </h3>
                      <GarfixBadge
                        variant={
                          integration.category === "payments"
                            ? "info"
                            : integration.category === "communications"
                            ? "success"
                            : integration.category === "storage"
                            ? "primary"
                            : "secondary"
                        }
                        size="sm"
                      >
                        {CATEGORY_LABELS[integration.category].ar}
                      </GarfixBadge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {integration.description}
                    </p>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-3">
                    {integration.hasCredentials ? (
                      <>
                        <GarfixBadge variant="success" size="sm" dot>
                          مُهيّأ
                        </GarfixBadge>
                        <GarfixButton
                          variant="outline"
                          size="xs"
                          onClick={() => handleTestConnection(integration.type)}
                          isLoading={testMutation.isPending && testingType === integration.type}
                        >
                          اختبار
                        </GarfixButton>
                        <GarfixButton
                          variant="secondary"
                          size="xs"
                          onClick={() => handleConfigure(integration.type)}
                        >
                          إعدادات
                        </GarfixButton>
                      </>
                    ) : (
                      <GarfixButton
                        variant="primary"
                        size="xs"
                        onClick={() => handleConfigure(integration.type)}
                        leadingIcon={<Plug size={12} />}
                      >
                        تهيئة
                      </GarfixButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </GarfixCard>
        )}
      </div>

      {/* Modals */}
      <ConfigureIntegrationModal
        isOpen={!!configuringType}
        onClose={() => setConfiguringType(null)}
        integration={configuringMeta}
        isSaving={updateMutation.isPending}
        onSave={handleSaveConfig}
      />

      <TestConnectionModal
        isOpen={!!testingType}
        onClose={handleCloseTestModal}
        integrationName={testingInfo?.name || ""}
        integrationIcon={testingInfo?.icon || "🔌"}
        status={testStatus}
        result={testResult}
        onRetry={() => testingType && handleTestConnection(testingType)}
      />
    </div>
  );
}
