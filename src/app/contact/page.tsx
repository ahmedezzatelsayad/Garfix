"use client";

import { useId, useState } from "react";
import { Mail, Phone, MapPin, MessageCircle, Clock, Send } from "lucide-react";
import { FooterPageLayout } from "@/components/garfix/FooterPageLayout";

// FE-09 FIX (Audit v2 · Phase 2)
// Accessibility hardening for the contact page:
//   • Every <label> now has htmlFor pointing at the input's id (so screen
//     readers announce the field name when the input is focused).
//   • The success banner now has role="status" so AT announces it as a live
//     region (WCAG 2.1 SC 4.1.3 Status Messages).

const CONTACT_METHODS = [
  {
    icon: <Mail size={22} />,
    title: "البريد الإلكتروني",
    detail: "support@garfix.io",
    desc: "نرد خلال 24 ساعة كحد أقصى",
    action: "mailto:support@garfix.io",
  },
  {
    icon: <Phone size={22} />,
    title: "الهاتف",
    detail: "+965 0000 0000",
    desc: "الأحد - الخميس، 9 صباحاً - 6 مساءً",
    action: "tel:+96500000000",
  },
  {
    icon: <MessageCircle size={22} />,
    title: "واتساب",
    detail: "+965 0000 0000",
    desc: "دعم فوري خلال ساعات العمل",
    action: "https://wa.me/96500000000",
  },
  {
    icon: <MapPin size={22} />,
    title: "العنوان",
    detail: "الكويت، مدينة الكويت",
    desc: "مكاتب GARFIX الرئيسية",
    action: "#",
  },
];

export default function ContactPage() {
  // FE-09 FIX (Audit v2 · Phase 2): stable unique ids for label↔input pairing.
  const nameId = useId();
  const emailId = useId();
  const subjectId = useId();
  const messageId = useId();
  // FE-16 FIX (Audit v2 · Phase 3): per-field error element ids so we can
  // wire aria-describedby on each input to its error message.
  const nameErrId = `${nameId}-error`;
  const emailErrId = `${emailId}-error`;
  const subjectErrId = `${subjectId}-error`;
  const messageErrId = `${messageId}-error`;

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  // FE-16 FIX (Audit v2 · Phase 3): per-field validation errors + a "tried"
  // flag so we don't flag invalid fields until the user has attempted submit.
  const [tried, setTried] = useState(false);
  const fieldErrors = {
    name: formData.name.trim() ? null : "الاسم مطلوب",
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())
      ? null
      : "بريد إلكتروني غير صالح",
    subject: formData.subject ? null : "الموضوع مطلوب",
    message: formData.message.trim() ? null : "الرسالة مطلوبة",
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    // FE-16 FIX: block submit if any field has an error.
    if (Object.values(fieldErrors).some(Boolean)) return;
    // In production, this would send to an API endpoint
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 5000);
    setFormData({ name: "", email: "", subject: "", message: "" });
    setTried(false);
  };

  return (
    <FooterPageLayout
      title="تواصل معنا"
      subtitle="نحن هنا لمساعدتك — تواصل معنا بأي طريقة تناسبك"
      icon={<Mail size={28} />}
    >
      <div className="space-y-10 text-foreground/80 text-[15px] leading-[1.9]">
        {/* طرق التواصل */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CONTACT_METHODS.map((method) => (
            <a
              key={method.title}
              href={method.action}
              target={method.action.startsWith("http") ? "_blank" : undefined}
              rel={method.action.startsWith("http") ? "noopener noreferrer" : undefined}
              className="bg-muted border border-border rounded-xl p-5 flex gap-4 items-start no-underline hover:bg-emerald-500/5 transition-all group"
            >
              <div className="w-11 h-11 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-500 dark:text-emerald-400 shrink-0 group-hover:bg-emerald-500/30 transition-all">
                {method.icon}
              </div>
              <div>
                <div className="font-bold text-foreground text-sm mb-0.5">{method.title}</div>
                <div className="text-emerald-500 dark:text-emerald-400 text-sm font-bold mb-1">{method.detail}</div>
                <div className="text-muted-foreground/70 text-[12px]">{method.desc}</div>
              </div>
            </a>
          ))}
        </div>

        {/* ساعات العمل */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 flex items-center gap-4">
          <Clock size={22} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
          <div>
            <div className="font-bold text-foreground text-sm mb-0.5">ساعات العمل</div>
            <div className="text-muted-foreground text-[13px]">
              الأحد - الخميس: 9:00 صباحاً - 6:00 مساءً (توقيت الكويت) | الجمعة - السبت: دعم الطوارئ فقط
            </div>
          </div>
        </div>

        {/* نموذج التواصل */}
        <div>
          <h2 className="text-xl font-extrabold text-foreground mb-5">أرسل لنا رسالة</h2>
          {submitted && (
            <div
              // FE-09 FIX (Audit v2 · Phase 2): role="status" so AT announces
              // the success message as a live region (SC 4.1.3).
              role="status"
              aria-live="polite"
              className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-4 text-green-400 text-sm text-center"
            >
              ✅ تم إرسال رسالتك بنجاح! سنرد عليك في أقرب وقت ممكن.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor={nameId}
                  className="block text-muted-foreground/90 text-sm font-bold mb-1.5"
                >الاسم الكامل</label>
                <input
                  id={nameId}
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  required
                  className="w-full px-4 py-3 rounded-lg bg-muted border border-border text-foreground text-sm outline-none focus-ring focus:border-emerald-500 transition-colors"
                  placeholder="أدخل اسمك"
                  dir="rtl"
                  // FE-16 FIX (Audit v2 · Phase 3): aria-invalid + describedby
                  // point to the inline error message rendered below.
                  aria-invalid={tried && !!fieldErrors.name}
                  aria-describedby={tried && fieldErrors.name ? nameErrId : undefined}
                />
                {tried && fieldErrors.name && (
                  <p id={nameErrId} role="alert" className="text-red-400 text-xs mt-1">
                    {fieldErrors.name}
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor={emailId}
                  className="block text-muted-foreground/90 text-sm font-bold mb-1.5"
                >البريد الإلكتروني</label>
                <input
                  id={emailId}
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                  required
                  className="w-full px-4 py-3 rounded-lg bg-muted border border-border text-foreground text-sm outline-none focus-ring focus:border-emerald-500 transition-colors"
                  placeholder="example@email.com"
                  dir="ltr"
                  // FE-16 FIX (Audit v2 · Phase 3): aria-invalid + describedby.
                  aria-invalid={tried && !!fieldErrors.email}
                  aria-describedby={tried && fieldErrors.email ? emailErrId : undefined}
                />
                {tried && fieldErrors.email && (
                  <p id={emailErrId} role="alert" className="text-red-400 text-xs mt-1">
                    {fieldErrors.email}
                  </p>
                )}
              </div>
            </div>
            <div>
              <label
                htmlFor={subjectId}
                className="block text-muted-foreground/90 text-sm font-bold mb-1.5"
              >الموضوع</label>
              <select
                id={subjectId}
                value={formData.subject}
                onChange={(e) => setFormData((p) => ({ ...p, subject: e.target.value }))}
                required
                className="w-full px-4 py-3 rounded-lg bg-muted border border-border text-foreground text-sm outline-none focus-ring focus:border-emerald-500 transition-colors appearance-none"
                // FE-16 FIX (Audit v2 · Phase 3): aria-invalid + describedby.
                aria-invalid={tried && !!fieldErrors.subject}
                aria-describedby={tried && fieldErrors.subject ? subjectErrId : undefined}
              >
                <option value="" className="bg-popover">اختر الموضوع</option>
                <option value="support" className="bg-popover">دعم فني</option>
                <option value="billing" className="bg-popover">استفسار عن الفوترة</option>
                <option value="sales" className="bg-popover">المبيعات والاشتراكات</option>
                <option value="partnership" className="bg-popover">شراكة تجارية</option>
                <option value="feedback" className="bg-popover">ملاحظات واقتراحات</option>
                <option value="other" className="bg-popover">أخرى</option>
              </select>
              {tried && fieldErrors.subject && (
                <p id={subjectErrId} role="alert" className="text-red-400 text-xs mt-1">
                  {fieldErrors.subject}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor={messageId}
                className="block text-muted-foreground/90 text-sm font-bold mb-1.5"
              >الرسالة</label>
              <textarea
                id={messageId}
                value={formData.message}
                onChange={(e) => setFormData((p) => ({ ...p, message: e.target.value }))}
                required
                rows={5}
                className="w-full px-4 py-3 rounded-lg bg-muted border border-border text-foreground text-sm outline-none focus-ring focus:border-emerald-500 transition-colors resize-y"
                placeholder="اكتب رسالتك هنا..."
                dir="rtl"
                // FE-16 FIX (Audit v2 · Phase 3): aria-invalid + describedby.
                aria-invalid={tried && !!fieldErrors.message}
                aria-describedby={tried && fieldErrors.message ? messageErrId : undefined}
              />
              {tried && fieldErrors.message && (
                <p id={messageErrId} role="alert" className="text-red-400 text-xs mt-1">
                  {fieldErrors.message}
                </p>
              )}
            </div>
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold text-sm cursor-pointer transition-all hover:shadow-brand-md active-press duration-150 border-none"
            >
              <Send size={16} />
              إرسال الرسالة
            </button>
          </form>
        </div>
      </div>
    </FooterPageLayout>
  );
}
