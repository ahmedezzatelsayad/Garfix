import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "حالة الخدمة · GarfiX",
  description: "حالة الخدمة الحالية لمنصة GarfiX EOS — وقت التشغيل، استجابة API، وسجل الأعطال والأحداث.",
};

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
