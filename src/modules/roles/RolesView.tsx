"use client";

/**
 * ═════════════════════════════════════════════════════════════
 * GarfiX DS v4.0 — Roles & Permissions View
 *
 * إدارة الأدوار والصلاحيات (RBAC):
 * - عرض الأدوار المدمجة (OWNER, ADMIN, MANAGER, ACCOUNTANT, EMPLOYEE, VIEWER)
 * - إنشاء/تعديل/حذف أدوار مخصصة
 * - عرض كتالوج الصلاحيات المتاحة
 * - عرض مستويات الصلاحية (none/read/write/approve/admin)
 *
 * Endpoints:
 * - GET    /api/permissions/roles     → قائمة الأدوار
 * - POST   /api/permissions/roles     → إنشاء دور مخصص
 * - PUT    /api/permissions/roles     → تعديل دور مخصص
 * - DELETE /api/permissions/roles     → حذف دور مخصص
 * - GET    /api/permissions/catalog   → كتالوج الصلاحيات
 * ═════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from "react";
import {
  Shield, Plus, Trash2, Edit2, Loader2, X, Check,
  Crown, UserCog, Users, Eye, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RoleDefinition {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  level: number;
  isBuiltIn: boolean;
  inheritsFrom?: string;
  permissions: Record<string, number>;
  inheritedPermissions?: Record<string, number>;
}

interface ApiResponse {
  builtIn: RoleDefinition[];
  custom: RoleDefinition[];
  total: number;
}

const ROLE_ICONS: Record<string, typeof Crown> = {
  OWNER: Crown,
  ADMIN: UserCog,
  MANAGER: Users,
  ACCOUNTANT: Briefcase,
  EMPLOYEE: Users,
  VIEWER: Eye,
};

const LEVEL_NAMES: Record<number, string> = {
  0: "ممنوع",
  1: "قراءة",
  2: "كتابة",
  3: "اعتماد",
  4: "إدارة",
};

const LEVEL_COLORS: Record<number, string> = {
  0: "bg-red-500/15 text-red-400",
  1: "bg-mutedackgroundlue-500/15 text-blue-400",
  2: "bg-cardmber-500/15 text-amber-400",
  3: "bg-purple-500/15 text-purple-400",
  4: "bg-mutedmerald-500/15 text-emerald-400",
};

export function RolesView() {
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleDefinition | null>(null);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/permissions/roles", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApiResponse = await res.json();
      setRoles([...data.builtIn, ...data.custom]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تحميل الأدوار");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetching
    fetchRoles();
  }, [fetchRoles]);

  const handleDelete = async (roleId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الدور؟")) return;
    try {
      const res = await fetch("/api/permissions/roles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ roleId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchRoles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الحذف");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="text-primary" size={28} />
            الأدوار والصلاحيات
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            إدارة أدوار المستخدمين والصلاحيات في النظام
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-all min-h-[44px]"
        >
          <Plus size={18} />
          دور جديد
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Roles List */}
      <div className="grid gap-4">
        {roles.map((role) => {
          const Icon = ROLE_ICONS[role.id] || Shield;
          const permCount = Object.keys(role.permissions).length;
          const inheritedCount = role.inheritedPermissions
            ? Object.keys(role.inheritedPermissions).length - permCount
            : 0;

          return (
            <div
              key={role.id}
              className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-all"
            >
              <div className="flex items-start gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                  role.isBuiltIn ? "bg-primary/10 text-primary" : "bg-gold/10 text-gold"
                )}>
                  <Icon size={24} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold">{role.nameAr || role.name}</h3>
                    <span className="text-xs text-muted-foreground">({role.name})</span>
                    {role.isBuiltIn ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-mutedackgroundlue-500/15 text-blue-400">
                        مدمج
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gold/15 text-gold">
                        مخصص
                      </span>
                    )}
                    {role.inheritsFrom && (
                      <span className="text-[10px] text-muted-foreground">
                        يرث من: {role.inheritsFrom}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground mt-1">{role.description}</p>

                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>{permCount} صلاحية مباشرة</span>
                    {inheritedCount > 0 && (
                      <span className="text-emerald-400">+ {inheritedCount} موروثة</span>
                    )}
                  </div>

                  {/* Permission Preview (first 5) */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {Object.entries(role.permissions).slice(0, 5).map(([perm, level]) => (
                      <span
                        key={perm}
                        className={cn(
                          "text-[10px] font-medium px-2 py-0.5 rounded-md",
                          LEVEL_COLORS[level] || LEVEL_COLORS[0]
                        )}
                      >
                        {perm}: {LEVEL_NAMES[level] || "—"}
                      </span>
                    ))}
                    {permCount > 5 && (
                      <span className="text-[10px] text-muted-foreground px-2 py-0.5">
                        +{permCount - 5} أخرى
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1">
                  <button
                    onClick={() => setSelectedRole(role)}
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title="عرض التفاصيل"
                  >
                    <Eye size={16} />
                  </button>
                  {!role.isBuiltIn && (
                    <>
                      <button
                        onClick={() => setSelectedRole(role)}
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
                        title="تعديل"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(role.id)}
                        className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
                        title="حذف"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Role Detail Modal */}
      {selectedRole && (
        <RoleDetailModal
          role={selectedRole}
          onClose={() => setSelectedRole(null)}
          onUpdated={fetchRoles}
        />
      )}

      {/* Create Role Modal */}
      {showCreateModal && (
        <CreateRoleModal
          onClose={() => setShowCreateModal(false)}
          onCreated={fetchRoles}
        />
      )}
    </div>
  );
}

// ── Role Detail Modal ──────────────────────────────────────────

function RoleDetailModal({
  role,
  onClose,
  onUpdated: _onUpdated,
}: {
  role: RoleDefinition;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const allPerms = { ...role.inheritedPermissions, ...role.permissions };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-mutedackgroundlack/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-bold text-lg">
            {role.nameAr || role.name} — التفاصيل
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {Object.entries(allPerms).map(([perm, level]) => {
              const isInherited = role.inheritedPermissions?.[perm] === level && !role.permissions[perm];
              return (
                <div
                  key={perm}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono">{perm}</span>
                    {isInherited && (
                      <span className="text-[10px] text-emerald-400">موروث</span>
                    )}
                  </div>
                  <span className={cn(
                    "text-[10px] font-medium px-2 py-0.5 rounded-md",
                    LEVEL_COLORS[level] || LEVEL_COLORS[0]
                  )}>
                    {LEVEL_NAMES[level] || "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create Role Modal ──────────────────────────────────────────

function CreateRoleModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [description, setDescription] = useState("");
  const [inheritsFrom, setInheritsFrom] = useState("VIEWER");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name || !nameAr) {
      setError("الاسم بالعربية والإنجليزية مطلوب");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/permissions/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          nameAr,
          description: description || `دور مخصص: ${nameAr}`,
          inheritsFrom,
          permissions: {},
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الإنشاء");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-mutedackgroundlack/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-bold text-lg">إنشاء دور جديد</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="text-sm font-medium block mb-1">الاسم (إنجليزي)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase().replace(/\s/g, "_"))}
              placeholder="CUSTOM_ROLE"
              className="w-full px-3 py-2 rounded-lg bg-mutedackgroundackground border border-border focus:border-primary outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">الاسم (عربي)</label>
            <input
              type="text"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder="دور مخصص"
              className="w-full px-3 py-2 rounded-lg bg-mutedackgroundackground border border-border focus:border-primary outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">الوصف</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="وصف موجز للدور..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-mutedackgroundackground border border-border focus:border-primary outline-none resize-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">يرث من</label>
            <select
              value={inheritsFrom}
              onChange={(e) => setInheritsFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-mutedackgroundackground border border-border focus:border-primary outline-none"
            >
              <option value="VIEWER">مشاهد (VIEWER)</option>
              <option value="EMPLOYEE">موظف (EMPLOYEE)</option>
              <option value="ACCOUNTANT">محاسب (ACCOUNTANT)</option>
              <option value="MANAGER">مدير (MANAGER)</option>
              <option value="ADMIN">مدير النظام (ADMIN)</option>
            </select>
          </div>

          <button
            onClick={handleCreate}
            disabled={saving}
            className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-all min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {saving ? (
              <><Loader2 size={16} className="animate-spin" /> جاري الإنشاء...</>
            ) : (
              <><Check size={16} /> إنشاء الدور</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
