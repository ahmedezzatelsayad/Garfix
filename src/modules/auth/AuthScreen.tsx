"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ChevronRight, Mail, Lock, User, Eye, EyeOff, KeyRound, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
      className="min-h-screen bg-gradient-to-br from-[#0f0a1e] via-[#1e1147] to-[#2d1b69] text-white flex items-center justify-center p-5 [font-family:var(--font-cairo),sans-serif]"
    >
      <div
        className="w-full max-w-[440px] bg-white/4 border border-white/8 rounded-[20px] py-10 px-8 backdrop-blur-[12px]"
      >
        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#a78bfa] flex items-center justify-center text-2xl font-black text-white shadow-[0_8px_24px_rgba(124,58,237,0.4)]"
          >G</div>
          <div>
            <div className="text-xl font-black">GARFIX</div>
            <div className="text-[10px] text-white/50 tracking-[2px]">EOS v12</div>
          </div>
        </div>

        <h1 className="text-[26px] font-extrabold text-center mb-1.5">
          {titles[mode].title}
        </h1>
        <p className="text-[13px] text-white/60 text-center mb-7">
          {titles[mode].sub}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            <div className="relative">
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
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 bg-transparent border-none text-white/50 cursor-pointer p-1 flex items-center"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          )}

          {mode === "register" && (
            <div className="relative">
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
                <div className="text-[11px] text-red-300 mt-1 px-1">
                  كلمتا المرور غير متطابقتين
                </div>
              )}
              {confirmPassword.length > 0 && password === confirmPassword && (
                <div className="text-[11px] text-green-300 mt-1 px-1">
                  ✓ متطابقة
                </div>
              )}
            </div>
          )}
          {mode === "register" && (
            <div className="text-[11px] text-white/45 px-1">
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
            <div className="relative">
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
                <div className="text-[11px] text-red-300 mt-1 px-1">
                  كلمتا المرور غير متطابقتين
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "py-3.5 rounded-[10px] bg-gradient-to-br from-[#7c3aed] to-[#a78bfa] text-white border-none font-inherit text-[15px] font-extrabold",
              "flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(124,58,237,0.4)] transition-all duration-200",
              loading ? "cursor-not-allowed opacity-70" : "cursor-pointer"
            )}
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
          <div className="mt-3 text-left">
            <button
              type="button"
              onClick={() => { setMode("forgot"); setPassword(""); }}
              className="bg-transparent border-none text-white/70 cursor-pointer font-inherit text-xs font-semibold underline p-0"
            >
              نسيت كلمة المرور؟
            </button>
          </div>
        )}

        {/* back-to-login from forgot/reset */}
        {(mode === "forgot" || mode === "reset") && (
          <div className="mt-4 text-center text-[13px] text-white/70">
            <button
              type="button"
              onClick={() => { setMode("login"); setResetCode(""); }}
              className="bg-transparent border-none text-[#a78bfa] cursor-pointer font-inherit text-[13px] font-bold underline"
            >
              العودة لتسجيل الدخول
            </button>
          </div>
        )}

        {/* login <-> register toggle (unchanged behavior) */}
        {(mode === "login" || mode === "register") && (
          <div className="mt-6 text-center text-[13px] text-white/70">
            {mode === "login" ? "ليس لديك حساب؟ " : "لديك حساب بالفعل؟ "}
            <button
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="bg-transparent border-none text-[#a78bfa] cursor-pointer font-inherit text-[13px] font-bold underline"
            >
              {mode === "login" ? "أنشئ حساباً" : "سجّل دخولك"}
            </button>
          </div>
        )}

        <button
          onClick={onBack}
          className="mt-5 w-full py-2.5 bg-transparent border border-white/15 text-white/60 rounded-lg font-inherit text-xs cursor-pointer transition-all duration-200"
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
    <div className="relative">
      <div
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 flex items-center"
      >
        {icon}
      </div>
      <input
        type={type}
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        dir={dir}
        minLength={minLength}
        className="w-full py-3 px-10 rounded-[10px] bg-white/6 border border-white/10 text-white font-inherit text-sm outline-none transition-all duration-200"
        onFocus={(e) => { e.target.style.borderColor = "rgba(124, 58, 237, 0.5)"; }}
        onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
      />
    </div>
  );
}
