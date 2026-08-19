/**
 * TestConnectionModal.tsx — Modal for testing integration connections.
 *
 * Provides:
 * - Visual feedback during connection test
 * - Success/error state display
 * - Detailed error messages
 * - Retry capability
 *
 * Uses GarfiX DS v4.0 components (GarfixModal, GarfixButton).
 */
"use client";

import React from "react";
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  Loader2
} from "lucide-react";
import { GarfixModal } from "@/components/garfix-ds/overlay/GarfixModal";
import { GarfixButton } from "@/components/garfix-ds/core/GarfixButton";

// ─── Types ───────────────────────────────────────────────────────────────

export type TestStatus = "idle" | "testing" | "success" | "error";

export interface TestResult {
  success: boolean;
  details?: string;
  error?: string;
  testedAt?: string;
}

interface TestConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  integrationName: string;
  integrationIcon: string;
  status: TestStatus;
  result: TestResult | null;
  onRetry: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────

export const TestConnectionModal: React.FC<TestConnectionModalProps> = ({
  isOpen,
  onClose,
  integrationName,
  integrationIcon,
  status,
  result,
  onRetry,
}) => {
  const formatTestedAt = (dateStr?: string) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleString("ar-EG", {
        dateStyle: "medium",
        timeStyle: "long",
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusContent = () => {
    switch (status) {
      case "testing":
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Loader2 className="h-10 w-10 text-emerald-500 animate-spin" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-card flex items-center justify-center shadow-lg">
                <Activity className="h-4 w-4 text-emerald-500 animate-pulse" />
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold text-card-foreground">
                جارٍ اختبار الاتصال...
              </p>
              <p className="text-sm text-muted-foreground">
                التحقق من صحة بيانات الاعتماد لـ {integrationName}
              </p>
            </div>

            {/* Progress bar animation */}
            <div className="w-full max-w-xs h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full animate-[pulse_1.5s_ease-in-out_infinite] w-full" 
                   style={{ animationDuration: '1.5s' }} />
            </div>
          </div>
        );

      case "success":
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                <CheckCircle2 className="h-4 w-4 text-white" size={16} />
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                اتصال ناجح! ✓
              </p>
              <p className="text-sm text-muted-foreground">
                {result?.details || `تم التحقق بنجاح من بيانات اعتماد ${integrationName}`}
              </p>
            </div>

            {result?.testedAt && (
              <p className="text-xs text-muted-foreground">
                وقت الاختبار: {formatTestedAt(result.testedAt)}
              </p>
            )}
          </div>
        );

      case "error":
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <XCircle className="h-10 w-10 text-red-500" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
                <AlertTriangle className="h-4 w-4 text-white" size={16} />
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                فشل الاتصال ✗
              </p>
              <p className="text-sm text-muted-foreground max-w-md">
                {result?.error || "حدث خطأ أثناء اختبار الاتصال"}
              </p>
            </div>

            {/* Error Details Box */}
            {result?.error && (
              <div className="w-full max-w-md p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50">
                <p className="text-xs font-mono text-red-700 dark:text-red-400 break-all">
                  {result.error}
                </p>
              </div>
            )}
          </div>
        );

      default: // idle
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center text-4xl">
              {integrationIcon}
            </div>
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold text-card-foreground">
                اختبار اتصال {integrationName}
              </p>
              <p className="text-sm text-muted-foreground">
                سيتم التحقق من صحة بيانات الاعتماد المخزنة
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <GarfixModal
      isOpen={isOpen}
      onClose={status === "testing" ? () => {} : onClose}
      title={`اختبار الاتصال — ${integrationName}`}
      description={
        status === "idle" 
          ? "اضغط 'بدء الاختبار' للتحقق من صحة الاتصال"
          : undefined
      }
      size="md"
      footer={
        <div className="flex items-center gap-3 w-full justify-end">
          <GarfixButton
            variant="outline"
            onClick={onClose}
            disabled={status === "testing"}
          >
            {status === "success" ? "حسناً" : "إغلاق"}
          </GarfixButton>
          
          {(status === "error" || status === "idle") && (
            <GarfixButton
              variant="primary"
              onClick={onRetry}
              leadingIcon={<RefreshCw size={14} />}
            >
              {status === "error" ? "إعادة المحاولة" : "بدء الاختبار"}
            </GarfixButton>
          )}
        </div>
      }
    >
      {getStatusContent()}
    </GarfixModal>
  );
};

TestConnectionModal.displayName = "TestConnectionModal";
