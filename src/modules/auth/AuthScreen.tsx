"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ChevronRight, Mail, Lock, User, Eye, EyeOff, KeyRound, ArrowRight } from "lucide-react";

/**
 * AuthScreen — login + register + forgot-password + reset-password.
 *
 * ONBOARDING P0 (forgot-password dead-end) — fixed:
 *   Adds a "نسيت كلمة المرور؟" link under the password field in `login` mode.
 *   Clicking it switches to `forgot` mode (email-only form, POST /api/auth/forgot-password).
 *   After the OTP is sent, switches to `reset` mode (email + code + new password),
 *   which POSTs to /api/auth/reset-password. The dev OTP returned by the sandbox
 *   is auto-filled for convenience; in production it would arrive by email.
 *
 * ONBOARDING P1 (registration UX gaps) — fixed:
 *   - Adds a "تأكيد كلمة المرور" field in `register` mode with client-side match check.
 *   - Tightens password policy to require 8+ chars AND at least one letter AND one digit
 *     (mirrors the zod schema in /api/auth/register/route.ts — kept in sync).
 *
 * All new UI matches the existing dark-gradient visual style of AuthScreen — no new
 * design language is introduced for the new modes.
 */

interface AuthScreenProps {
  onBack: () => void;
}

// Match the regex in /api/auth/register/route.ts exactly. Keep them in sync.
const PASSWORD_POLICY_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const PASSWORD_POLICY_HINT = "٨ أحرف على الأقل، يجب أن تحتوي على حرف ورقم";

type Mode = "login" | "register" | "forgot" | "reset";

export default function AuthScreen({ onBack }: AuthScreenProps) {
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        toast.success("تم تسجيل الدخول بنجاح");
      } else if (mode === "register") {
        if (!PASSWORD_POLICY_REGEX.test(password)) {
          throw new Error("كلمة المرور لا تستوفي السياسة: " + PASSWORD_POLICY_HINT);
        }
        if (password !== confirmPassword) {
          throw new Error("كلمتا المرور غير متطابقتين");
        }
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password, displayName }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Registration failed");
        toast.success("تم إنشاء الحساب بنجاح");
        await login(email, password);
      } else if (mode === "forgot") {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "فشل إرسال الرمز");
        // Sandbox convenience: devCode is the OTP returned in non-production.
        // In production this would arrive by email instead.
        if (data.devCode) {
          setResetCode(data.devCode);
          toast.success("تم إرسال الرمز (وضع التطوير): " + data.devCode);
        } else {
          toast.success(data.message || "تم إرسال رمز التحقق إلى بريدك");
        }
        setMode("reset");
      } else if (mode === "reset") {
        if (!PASSWORD_POLICY_REGEX.test(password)) {
          throw new Error("كلمة المرور لا تستوفي السياسة: " + PASSWORD_POLICY_HINT);
        }
        if (password !== confirmPassword) {
          throw new Error("كلمتا المرور غير متطابقتين");
        }
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code: resetCode, newPassword: password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "فشل إعادة التعيين");
        toast.success("تم تغيير كلمة المرور بنجاح. سجّل الدخول الآن.");
        setMode("login");
        setResetCode("");
        setPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ غير معروف");
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<Mode, { title: string; sub: string }> = {
    login: { title: "أهلاً بعودتك!", sub: "سجّل دخولك للوصول إلى لوحة التحكم" },
    register: { title: "إنشاء حساب جديد", sub: "ابدأ تجربتك المجانية لمدة ٣٠ يوماً" },
    forgot: { title: "نسيت كلمة المرور؟", sub: "أدخل بريدك الإلكتروني وسنرسل لك رمز التحقق" },
    reset: { title: "إعادة تعيين كلمة المرور", sub: "أدخل الرمز الذي وصلك وكلمة المرور الجديدة" },
  };

  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f0a1e 0%, #1e1147 50%, #2d1b69 100%)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        fontFamily: "var(--font-cairo), sans-serif",
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: "440px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "20px",
          padding: "40px 32px",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", justifyContent: "center", marginBottom: "32px" }}>
          <div
            style={{
              width: "48px", height: "48px", borderRadius: "12px",
              background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "24px", fontWeight: 900, color: "#fff",
              boxShadow: "0 8px 24px rgba(124, 58, 237, 0.4)",
            }}
          >G</div>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 900 }}>GARFIX</div>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", letterSpacing: "2px" }}>EOS v12</div>
          </div>
        </div>

        <h1 style={{ fontSize: "26px", fontWeight: 800, textAlign: "center", marginBottom: "6px" }}>
          {titles[mode].title}
        </h1>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", textAlign: "center", marginBottom: "28px" }}>
          {titles[mode].sub}
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {mode === "register" && (
            <Field
              icon={<User size={16} />}
              type="text"
              placeholder="الاسم الكامل"
              value={displayName}
              onChange={setDisplayName}
              required
            />
          )}
          <Field
            icon={<Mail size={16} />}
            type="email"
            placeholder="البريد الإلكتروني"
            value={email}
            onChange={setEmail}
            required
            dir="ltr"
          />

          {(mode === "login" || mode === "register" || mode === "reset") && (
            <div style={{ position: "relative" }}>
              <Field
                icon={<Lock size={16} />}
                type={showPassword ? "text" : "password"}
                placeholder={mode === "reset" ? "كلمة المرور الجديدة" : "كلمة المرور"}
                value={password}
                onChange={setPassword}
                required
                dir="ltr"
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
                  background: "transparent", border: "none", color: "rgba(255,255,255,0.5)",
                  cursor: "pointer", padding: "4px", display: "flex", alignItems: "center",
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          )}

          {mode === "register" && (
            <div style={{ position: "relative" }}>
              <Field
                icon={<Lock size={16} />}
                type={showPassword ? "text" : "password"}
                placeholder="تأكيد كلمة المرور"
                value={confirmPassword}
                onChange={setConfirmPassword}
                required
                dir="ltr"
                minLength={8}
              />
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <div style={{ fontSize: "11px", color: "#fca5a5", marginTop: "4px", paddingInlineStart: "4px" }}>
                  كلمتا المرور غير متطابقتين
                </div>
              )}
              {confirmPassword.length > 0 && password === confirmPassword && (
                <div style={{ fontSize: "11px", color: "#86efac", marginTop: "4px", paddingInlineStart: "4px" }}>
                  ✓ متطابقة
                </div>
              )}
            </div>
          )}
          {mode === "register" && (
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", paddingInlineStart: "4px" }}>
              سياسة كلمة المرور: {PASSWORD_POLICY_HINT}
            </div>
          )}

          {mode === "reset" && (
            <Field
              icon={<KeyRound size={16} />}
              type="text"
              placeholder="رمز التحقق (٦ أرقام)"
              value={resetCode}
              onChange={setResetCode}
              required
              dir="ltr"
              minLength={6}
            />
          )}
          {mode === "reset" && (
            <div style={{ position: "relative" }}>
              <Field
                icon={<Lock size={16} />}
                type={showPassword ? "text" : "password"}
                placeholder="تأكيد كلمة المرور الجديدة"
                value={confirmPassword}
                onChange={setConfirmPassword}
                required
                dir="ltr"
                minLength={8}
              />
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <div style={{ fontSize: "11px", color: "#fca5a5", marginTop: "4px", paddingInlineStart: "4px" }}>
                  كلمتا المرور غير متطابقتين
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "14px", borderRadius: "10px",
              background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
              color: "#fff", border: "none", fontFamily: "inherit", fontSize: "15px", fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
              boxShadow: "0 8px 24px rgba(124, 58, 237, 0.4)",
              transition: "all .2s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            }}
          >
            {loading
              ? "جارٍ…"
              : mode === "login"
                ? "تسجيل الدخول"
                : mode === "register"
                  ? "إنشاء الحساب"
                  : mode === "forgot"
                    ? "إرسال رمز التحقق"
                    : "إعادة تعيين كلمة المرور"}
            {!loading && (mode === "login" || mode === "register") && <ChevronRight size={18} />}
            {!loading && (mode === "forgot" || mode === "reset") && <ArrowRight size={18} />}
          </button>
        </form>

        {/* forgot-password link — only in login mode (Onboarding P0 fix) */}
        {mode === "login" && (
          <div style={{ marginTop: "12px", textAlign: "left" }}>
            <button
              type="button"
              onClick={() => { setMode("forgot"); setPassword(""); }}
              style={{
                background: "transparent", border: "none", color: "rgba(255,255,255,0.7)",
                cursor: "pointer", fontFamily: "inherit", fontSize: "12px", fontWeight: 600,
                textDecoration: "underline", padding: 0,
              }}
            >
              نسيت كلمة المرور؟
            </button>
          </div>
        )}

        {/* back-to-login from forgot/reset */}
        {(mode === "forgot" || mode === "reset") && (
          <div style={{ marginTop: "16px", textAlign: "center", fontSize: "13px", color: "rgba(255,255,255,0.7)" }}>
            <button
              type="button"
              onClick={() => { setMode("login"); setResetCode(""); }}
              style={{
                background: "transparent", border: "none", color: "#a78bfa",
                cursor: "pointer", fontFamily: "inherit", fontSize: "13px", fontWeight: 700,
                textDecoration: "underline",
              }}
            >
              العودة لتسجيل الدخول
            </button>
          </div>
        )}

        {/* login <-> register toggle (unchanged behavior) */}
        {(mode === "login" || mode === "register") && (
          <div style={{ marginTop: "24px", textAlign: "center", fontSize: "13px", color: "rgba(255,255,255,0.7)" }}>
            {mode === "login" ? "ليس لديك حساب؟ " : "لديك حساب بالفعل؟ "}
            <button
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              style={{
                background: "transparent", border: "none", color: "#a78bfa",
                cursor: "pointer", fontFamily: "inherit", fontSize: "13px", fontWeight: 700,
                textDecoration: "underline",
              }}
            >
              {mode === "login" ? "أنشئ حساباً" : "سجّل دخولك"}
            </button>
          </div>
        )}

        <button
          onClick={onBack}
          style={{
            marginTop: "20px", width: "100%", padding: "10px",
            background: "transparent", border: "1px solid rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.6)", borderRadius: "8px",
            fontFamily: "inherit", fontSize: "12px", cursor: "pointer", transition: "all .2s",
          }}
        >
          العودة للصفحة الرئيسية
        </button>
      </div>
    </div>
  );
}

function Field({
  icon, type, placeholder, value, onChange, required, dir, minLength,
}: {
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  dir?: string;
  minLength?: number;
}) {
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
          color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center",
        }}
      >
        {icon}
      </div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        dir={dir}
        minLength={minLength}
        style={{
          width: "100%", padding: "12px 40px", borderRadius: "10px",
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
          color: "#fff", fontFamily: "inherit", fontSize: "14px",
          outline: "none", transition: "all .2s",
        }}
        onFocus={(e) => { e.target.style.borderColor = "rgba(124, 58, 237, 0.5)"; }}
        onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
      />
    </div>
  );
}
