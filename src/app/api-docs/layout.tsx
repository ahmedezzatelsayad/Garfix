import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "وثائق API · GarfiX",
  description: "وثائق واجهة برمجة التطبيقات لمنصة GarfiX EOS — نقاط نهاية المصادقة، الفواتير، العملاء، الحسابات، والمزيد.",
};

export default function ApiDocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
