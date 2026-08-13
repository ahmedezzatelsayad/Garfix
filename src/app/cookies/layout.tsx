import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "سياسة ملفات تعريف الارتباط · GarfiX",
  description: "سياسة إدارة ملفات تعريف الارتباط لمنصة GarfiX EOS — أنواع ملفات تعريف الارتباط وأغراضها وكيفية التحكم فيها.",
};

export default function CookiesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
