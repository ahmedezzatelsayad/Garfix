"use client";

import { useState, useEffect } from "react";
import { Activity, CheckCircle, AlertTriangle, XCircle, Clock, RefreshCw } from "lucide-react";
import { FooterPageLayout } from "@/components/garfix/FooterPageLayout";

interface ServiceStatus {
  name: string;
  status: "operational" | "degraded" | "outage" | "maintenance";
  uptime: string;
  latency: string;
  description: string;
}

const SERVICES: ServiceStatus[] = [
  { name: "لوحة التحكم", status: "operational", uptime: "99.98%", latency: "45ms", description: "الواجهة الرئيسية للمستخدم وإدارة الأعمال" },
  { name: "واجهة برمجة التطبيقات (API)", status: "operational", uptime: "99.99%", latency: "32ms", description: "جميع نقاط نهاية API للمنصة" },
  { name: "نظام الفواتير", status: "operational", uptime: "99.97%", latency: "58ms", description: "إنشاء وإرسال ومعالجة الفواتير" },
  { name: "مساعد الذكاء الاصطناعي", status: "operational", uptime: "99.95%", latency: "120ms", description: "المساعد الذكي ومعالجة الأوامر" },
  { name: "قاعدة البيانات", status: "operational", uptime: "99.99%", latency: "12ms", description: "قواعد بيانات PostgreSQL وPrisma" },
  { name: "نظام المصادقة", status: "operational", uptime: "99.99%", latency: "28ms", description: "تسجيل الدخول وإدارة الجلسات والرموز" },
  { name: "النسخ الاحتياطي", status: "operational", uptime: "100%", latency: "-", description: "النسخ الاحتياطية اليومية التلقائية" },
  { name: "نظام الإشعارات", status: "operational", uptime: "99.90%", latency: "85ms", description: "الإشعارات عبر البريد الإلكتروني والواتساب" },
];

const STATUS_CONFIG = {
  operational: { label: "يعمل بشكل طبيعي", color: "text-green-400", bg: "bg-green-400/10", icon: <CheckCircle size={16} /> },
  degraded: { label: "أداء متدني", color: "text-yellow-400", bg: "bg-yellow-400/10", icon: <AlertTriangle size={16} /> },
  outage: { label: "انقطاع", color: "text-red-400", bg: "bg-red-400/10", icon: <XCircle size={16} /> },
  maintenance: { label: "صيانة مجدولة", color: "text-blue-400", bg: "bg-blue-400/10", icon: <Clock size={16} /> },
};

const INCIDENT_HISTORY = [
  {
    date: "15 يوليو 2025",
    title: "تأخير طفيف في نظام الإشعارات",
    status: "تم الحل",
    duration: "23 دقيقة",
    desc: "تأخر في إرسال بعض إشعارات البريد الإلكتروني بسبب ضغط مؤقت على خوادم الإشعارات. تم حل المشكلة بتوسيع سعة المعالجة.",
  },
  {
    date: "2 يوليو 2025",
    title: "صيانة مجدولة لقاعدة البيانات",
    status: "مكتمل",
    duration: "15 دقيقة",
    desc: "ترقية خوادم قاعدة البيانات إلى إصدار أحدث لتحسين الأداء. تم تنفيذ الصيانة خارج ساعات الذروة دون تأثير ملحوظ.",
  },
  {
    date: "18 يونيو 2025",
    title: "انقطاع مؤقت في مساعد الذكاء الاصطناعي",
    status: "تم الحل",
    duration: "45 دقيقة",
    desc: "توقف مؤقت في خدمة المساعد الذكي بسبب مشكلة في مزود الذكاء الاصطناعي. تم التبديل إلى مزود احتياطي واستعادة الخدمة.",
  },
];

export default function StatusPage() {
  const [lastChecked, setLastChecked] = useState<string>("");
  const [overallStatus, setOverallStatus] = useState<"operational" | "degraded" | "outage">("operational");

  useEffect(() => {
    const now = new Date();
    setLastChecked(now.toLocaleString("ar-KW", { timeZone: "Asia/Kuwait" }));
    // Determine overall status from services
    const hasOutage = SERVICES.some((s) => s.status === "outage");
    const hasDegraded = SERVICES.some((s) => s.status === "degraded");
    if (hasOutage) setOverallStatus("outage");
    else if (hasDegraded) setOverallStatus("degraded");
    else setOverallStatus("operational");
  }, []);

  const overallConfig = STATUS_CONFIG[overallStatus];

  return (
    <FooterPageLayout
      title="حالة الخدمة"
      subtitle="الوضع الحالي لجميع خدمات GARFIX وسجل الأعطال"
      icon={<Activity size={28} />}
    >
      <div className="space-y-10 text-white/80 text-[15px] leading-[1.9]">
        {/* الحالة الإجمالية */}
        <div className={`${overallConfig.bg} border border-white/[0.06] rounded-xl p-6 text-center`}>
          <div className={`inline-flex items-center gap-2 ${overallConfig.color} text-lg font-extrabold mb-2`}>
            {overallConfig.icon}
            جميع الأنظمة تعمل بشكل طبيعي
          </div>
          <p className="text-white/50 text-sm">
            آخر فحص: {lastChecked} (توقيت الكويت)
          </p>
          <button
            onClick={() => {
              const now = new Date();
              setLastChecked(now.toLocaleString("ar-KW", { timeZone: "Asia/Kuwait" }));
            }}
            className="mt-3 inline-flex items-center gap-1.5 text-white/40 hover:text-white/60 text-xs cursor-pointer bg-transparent border-none transition-colors"
          >
            <RefreshCw size={12} />
            تحديث
          </button>
        </div>

        {/* ملخص الأداء */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "وقت التشغيل", value: "99.97%", sub: "آخر 30 يوماً" },
            { label: "متوسط الاستجابة", value: "54ms", sub: "عالمياً" },
            { label: "حوادث الشهر", value: "1", sub: "يوليو 2025" },
            { label: "وقت الاسترداد", value: "< 30 د", sub: "متوسط" },
          ].map((stat) => (
            <div key={stat.label} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
              <div className="text-2xl font-black text-[#fbbf24]">{stat.value}</div>
              <div className="text-xs text-white/70 font-bold mt-0.5">{stat.label}</div>
              <div className="text-[10px] text-white/40">{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* حالة كل خدمة */}
        <section>
          <h2 className="text-xl font-extrabold text-white mb-5">حالة الخدمات</h2>
          <div className="space-y-2">
            {SERVICES.map((service) => {
              const config = STATUS_CONFIG[service.status];
              return (
                <div
                  key={service.name}
                  className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-all"
                >
                  <div className={`${config.color} shrink-0`}>{config.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-white text-sm">{service.name}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${config.bg} ${config.color} font-bold`}>
                        {config.label}
                      </span>
                    </div>
                    <div className="text-white/50 text-[12px]">{service.description}</div>
                  </div>
                  <div className="text-left shrink-0 hidden sm:block">
                    <div className="text-white/70 text-xs font-bold">{service.uptime}</div>
                    <div className="text-white/40 text-[10px]">{service.latency}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* سجل الأعطال */}
        <section>
          <h2 className="text-xl font-extrabold text-white mb-5">سجل الأعطال</h2>
          <div className="space-y-4">
            {INCIDENT_HISTORY.map((incident) => (
              <div
                key={incident.title}
                className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5"
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-white/40 text-xs">{incident.date}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-400/10 text-green-400 font-bold">
                    {incident.status}
                  </span>
                  <span className="text-white/40 text-[11px]">المدة: {incident.duration}</span>
                </div>
                <div className="font-bold text-white text-sm mb-1.5">{incident.title}</div>
                <p className="text-white/60 text-[13px] leading-relaxed">{incident.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* الاشتراك في التحديثات */}
        <div className="bg-[rgba(124,58,237,0.08)] border border-[rgba(124,58,237,0.2)] rounded-xl p-6 text-center">
          <h3 className="font-bold text-white text-sm mb-2">اشترك في تحديثات حالة الخدمة</h3>
          <p className="text-white/50 text-[13px] mb-4">
            احصل على إشعارات فورية عند حدوث أي تغيير في حالة الخدمات
          </p>
          <div className="flex gap-2 max-w-[400px] mx-auto">
            <input
              type="email"
              placeholder="بريدك الإلكتروني"
              className="flex-1 px-4 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white text-sm outline-none focus:border-[#7c3aed] transition-colors"
              dir="ltr"
            />
            <button className="px-5 py-2.5 rounded-lg bg-[linear-gradient(135deg,#7c3aed,#a78bfa)] text-white font-bold text-sm cursor-pointer border-none transition-all hover:shadow-[0_4px_12px_rgba(124,58,237,0.3)] whitespace-nowrap">
              اشترك
            </button>
          </div>
        </div>
      </div>
    </FooterPageLayout>
  );
}
