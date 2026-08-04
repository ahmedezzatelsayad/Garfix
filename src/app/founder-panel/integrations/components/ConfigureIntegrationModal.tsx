/**
 * ConfigureIntegrationModal.tsx — Modal for configuring integration credentials.
 *
 * Provides:
 * - Dynamic form based on integration field definitions
 * - Required/optional field indicators
 * - Password masking for sensitive fields
 * - Select dropdowns for option fields
 * - Boolean toggle fields
 * - Validation before save
 *
 * Uses GarfiX DS v4.0 components (GarfixModal, GarfixButton, GarfixInput).
 */
"use client";

import React, { useState, useEffect } from "react";
import { 
  Save, 
  Eye, 
  EyeOff,
  AlertCircle,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GarfixModal } from "@/components/garfix-ds/overlay/GarfixModal";
import { GarfixButton } from "@/components/garfix-ds/core/GarfixButton";
import { GarfixBadge } from "@/components/garfix-ds/core/GarfixBadge";
import type { IntegrationMeta, IntegrationFieldDef } from "@/lib/integrations/types";

// ─── Types ───────────────────────────────────────────────────────────────

interface ConfigureIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  integration: IntegrationMeta | null;
  isSaving?: boolean;
  onSave: (type: string, credentials: Record<string, string>) => void;
}

// ─── Field Input Component ───────────────────────────────────────────────

interface FieldInputProps {
  field: IntegrationFieldDef;
  value: string | boolean;
  onChange: (key: string, value: string) => void;
  error?: string;
}

const FieldInput: React.FC<FieldInputProps> = ({ field, value, onChange, error }) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPasswordField = field.type === "password";
  const isBooleanField = field.type === "boolean";
  const isSelectField = field.type === "select";
  
  const displayValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : (value || '');

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-sm font-medium text-card-foreground">
        <span>{field.label}</span>
        <code className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          {field.key}
        </code>
        {!field.optional && (
          <span className="text-red-500 text-xs">*</span>
        )}
      </label>

      {/* Boolean Toggle */}
      {isBooleanField ? (
        <button
          type="button"
          onClick={() => onChange(field.key, String(!value))}
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
            value ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
              value ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      ) : isSelectField ? (
        /* Select Dropdown */
        <select
          value={displayValue}
          onChange={(e) => onChange(field.key, e.target.value)}
          dir="ltr"
          className={cn(
            "w-full px-3 py-2 rounded-lg border bg-background text-foreground",
            "text-sm transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary",
            error ? "border-red-500" : "border-border"
          )}
        >
          <option value="">اختر {field.label}...</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        /* Text / Password / Email Input */
        <div className="relative">
          <input
            type={isPasswordField && !showPassword ? "password" : "text"}
            value={displayValue}
            onChange={(e) => onChange(field.key, e.target.value)}
            dir="ltr"
            placeholder={field.placeholder || ""}
            className={cn(
              "w-full pl-3 pr-10 py-2 rounded-lg border bg-background text-foreground",
              "text-sm font-mono transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary",
              error ? "border-red-500" : "border-border"
            )}
          />
          
          {/* Password Toggle */}
          {isPasswordField && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-500">
          <AlertCircle size={12} />
          {error}
        </p>
      )}

      {/* Field Hint */}
      {field.default !== undefined && !value && !isBooleanField && (
        <p className="text-xs text-muted-foreground">
          الافتراضي: <code>{String(field.default)}</code>
        </p>
      )}
    </div>
  );
};

// ─── Main Modal Component ────────────────────────────────────────────────

export const ConfigureIntegrationModal: React.FC<ConfigureIntegrationModalProps> = ({
  isOpen,
  onClose,
  integration,
  isSaving = false,
  onSave,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showOptional, setShowOptional] = useState(false);

  // Reset form when integration changes
  useEffect(() => {
    if (integration) {
      // Set default values
      const defaults: Record<string, string> = {};
      
      [...(integration.requiredFields || []), ...(integration.optionalFields || [])].forEach((field) => {
        if (field.default !== undefined) {
          defaults[field.key] = String(field.default);
        }
      });
      
      setValues(defaults);
      setErrors({});
      setShowOptional(false);
    }
  }, [integration]);

  const handleChange = (key: string, value: string | boolean) => {
    setValues((prev) => ({
      ...prev,
      [key]: String(value),
    }));
    // Clear error on change
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    if (!integration) return false;

    const newErrors: Record<string, string> = {};
    
    integration.requiredFields.forEach((field) => {
      if (!values[field.key] || values[field.key].trim() === "") {
        newErrors[field.key] = `${field.label} مطلوب`;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!integration) return;
    
    if (!validate()) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    onSave(integration.type, values);
  };

  if (!integration) return null;

  const optionalFields = integration.optionalFields || [];
  const hasOptionalFields = optionalFields.length > 0;

  return (
    <GarfixModal
      isOpen={isOpen}
      onClose={isSaving ? () => {} : onClose}
      header={
        <div className="flex items-center gap-3">
          <span className="text-2xl">{integration.icon}</span>
          <div>
            <h2>تهيئة {integration.name}</h2>
            <p className="text-sm font-normal text-muted-foreground mt-0.5">
              أدخل بيانات الاعتماد — تُخزَّن مشفّرة
            </p>
          </div>
        </div>
      }
      size="lg"
      footer={
        <div className="flex items-center gap-3 w-full justify-between">
          <GarfixBadge variant="info" size="sm" icon={<AlertCircle size={10} />}>
            مشفّرة بتقنية AES-256
          </GarfixBadge>
          
          <div className="flex items-center gap-3">
            <GarfixButton
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              إلغاء
            </GarfixButton>
            
            <GarfixButton
              variant="primary"
              onClick={handleSubmit}
              isLoading={isSaving}
              leadingIcon={<Save size={14} />}
            >
              حفظ بيانات الاعتماد
            </GarfixButton>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Security Notice */}
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50">
          <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <span>
              تُشفَّر جميع بيانات الاعتماد قبل تخزينها في قاعدة البيانات باستخدام 
              <strong> cryptoVault</strong>. لا يمكن استرجاع القيم الأصلية بعد الحفظ.
            </span>
          </p>
        </div>

        {/* Required Fields Section */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-card-foreground uppercase tracking-wider flex items-center gap-2">
            <span className="text-red-500">*</span>
            الحقول المطلوبة
          </h4>
          
          <div className="grid gap-4 sm:grid-cols-2">
            {integration.requiredFields.map((field) => (
              <FieldInput
                key={field.key}
                field={{ ...field, optional: false }}
                value={values[field.key] || ""}
                onChange={handleChange}
                error={errors[field.key]}
              />
            ))}
          </div>
        </div>

        {/* Optional Fields Section */}
        {hasOptionalFields && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setShowOptional(!showOptional)}
              className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 hover:text-foreground transition-colors"
            >
              <span className={cn(
                "transition-transform",
                showOptional && "rotate-90"
              )}>
                ▸
              </span>
              خيارات إضافية ({optionalFields.length})
            </button>
            
            {showOptional && (
              <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border/50">
                {optionalFields.map((field) => (
                  <FieldInput
                    key={field.key}
                    field={{ ...field, optional: true }}
                    value={values[field.key] || field.default || ""}
                    onChange={handleChange}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Webhook URL Display (for webhook-based integrations) */}
        {integration.webhookUrl && (
          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 space-y-2">
            <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-400">
              عنوان Webhook
            </h4>
            <p className="text-xs text-blue-600 dark:text-blue-400 font-mono break-all p-2 bg-white/50 dark:bg-black/20 rounded-lg">
              {integration.webhookUrl}
            </p>
            <p className="text-xs text-blue-600/70 dark:text-blue-400/70">
              انسخ هذا العنوان وأضفه في لوحة تحكم {integration.name}
            </p>
          </div>
        )}
      </div>
    </GarfixModal>
  );
};

ConfigureIntegrationModal.displayName = "ConfigureIntegrationModal";
