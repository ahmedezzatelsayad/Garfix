"use client";

import { useState } from "react";
import { Mail, Phone, MapPin, MessageCircle, Clock, Send } from "lucide-react";
import { FooterPageLayout } from "@/components/garfix/FooterPageLayout";

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
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, this would send to an API endpoint
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 5000);
    setFormData({ name: "", email: "", subject: "", message: "" });
  };

  return (
    <FooterPageLayout
      title="تواصل معنا"
      subtitle="نحن هنا لمساعدتك — تواصل معنا بأي طريقة تناسبك"
      icon={<Mail size={28} />}
    >
      <div className="space-y-10 text-white/80 text-[15px] leading-[1.9]">
        {/* طرق التواصل */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CONTACT_METHODS.map((method) => (
            <a
              key={method.title}
              href={method.action}
              target={method.action.startsWith("http") ? "_blank" : undefined}
              rel={method.action.startsWith("http") ? "noopener noreferrer" : undefined}
              className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex gap-4 items-start no-underline hover:bg-white/[0.06] transition-all group"
            >
              <div className="w-11 h-11 rounded-lg bg-[rgba(124,58,237,0.15)] flex items-center justify-center text-[#c4b5fd] shrink-0 group-hover:bg-[rgba(124,58,237,0.25)] transition-all">
                {method.icon}
              </div>
              <div>
                <div className="font-bold text-white text-sm mb-0.5">{method.title}</div>
                <div className="text-[#c4b5fd] text-sm font-bold mb-1">{method.detail}</div>
                <div className="text-white/50 text-[12px]">{method.desc}</div>
              </div>
            </a>
          ))}
        </div>

        {/* ساعات العمل */}
        <div className="bg-[rgba(124,58,237,0.08)] border border-[rgba(124,58,237,0.2)] rounded-xl p-5 flex items-center gap-4">
          <Clock size={22} className="text-[#c4b5fd] shrink-0" />
          <div>
            <div className="font-bold text-white text-sm mb-0.5">ساعات العمل</div>
            <div className="text-white/60 text-[13px]">
              الأحد - الخميس: 9:00 صباحاً - 6:00 مساءً (توقيت الكويت) | الجمعة - السبت: دعم الطوارئ فقط
            </div>
          </div>
        </div>

        {/* نموذج التواصل */}
        <div>
          <h2 className="text-xl font-extrabold text-white mb-5">أرسل لنا رسالة</h2>
          {submitted && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-4 text-green-400 text-sm text-center">
              ✅ تم إرسال رسالتك بنجاح! سنرد عليك في أقرب وقت ممكن.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-white/70 text-sm font-bold mb-1.5">الاسم الكامل</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  required
                  className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white text-sm outline-none focus:border-[#7c3aed] transition-colors"
                  placeholder="أدخل اسمك"
                  dir="rtl"
                />
              </div>
              <div>
                <label className="block text-white/70 text-sm font-bold mb-1.5">البريد الإلكتروني</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                  required
                  className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white text-sm outline-none focus:border-[#7c3aed] transition-colors"
                  placeholder="example@email.com"
                  dir="ltr"
                />
              </div>
            </div>
            <div>
              <label className="block text-white/70 text-sm font-bold mb-1.5">الموضوع</label>
              <select
                value={formData.subject}
                onChange={(e) => setFormData((p) => ({ ...p, subject: e.target.value }))}
                required
                className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white text-sm outline-none focus:border-[#7c3aed] transition-colors appearance-none"
              >
                <option value="" className="bg-[#1a1035]">اختر الموضوع</option>
                <option value="support" className="bg-[#1a1035]">دعم فني</option>
                <option value="billing" className="bg-[#1a1035]">استفسار عن الفوترة</option>
                <option value="sales" className="bg-[#1a1035]">المبيعات والاشتراكات</option>
                <option value="partnership" className="bg-[#1a1035]">شراكة تجارية</option>
                <option value="feedback" className="bg-[#1a1035]">ملاحظات واقتراحات</option>
                <option value="other" className="bg-[#1a1035]">أخرى</option>
              </select>
            </div>
            <div>
              <label className="block text-white/70 text-sm font-bold mb-1.5">الرسالة</label>
              <textarea
                value={formData.message}
                onChange={(e) => setFormData((p) => ({ ...p, message: e.target.value }))}
                required
                rows={5}
                className="w-full px-4 py-3 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white text-sm outline-none focus:border-[#7c3aed] transition-colors resize-y"
                placeholder="اكتب رسالتك هنا..."
                dir="rtl"
              />
            </div>
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-3 rounded-lg bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white font-bold text-sm cursor-pointer transition-all hover:shadow-[0_4px_12px_rgba(124,58,237,0.3)] border-none"
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
