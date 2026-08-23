import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "مميزات المنصة — 18 وحدة متكاملة",
  description:
    "كل مميزات جارفيكس: فواتير إلكترونية معتمدة ZATCA/ETA، محاسبة مزدوجة كاملة، إدخال مجمع بالذكاء الاصطناعي، مخزون متعدد المستودعات بمنع البيع الزائد، موارد بشرية ورواتب، أتمتة وتقارير لحظية.",
  alternates: { canonical: "/features" },
  openGraph: {
    title: "مميزات جارفيكس — 18 وحدة لإدارة أعمالك",
    description: "من الفاتورة الإلكترونية المعتمدة حتى القوائم المالية — وحدات متكاملة تعمل معًا بالذكاء الاصطناعي.",
    url: "/features",
    images: ["/og-image.png"],
  },
};

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
