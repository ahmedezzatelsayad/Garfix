import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "الأسعار والباقات — تبدأ من 37.5 ريالًا",
  description:
    "خطط أسعار واضحة لجارفيكس: المبتدئة 37.5 ريالًا، النمو 75 ريالًا (الأكثر شعبية)، والمؤسسات 112.5 ريالًا شهريًا. تجربة مجانية 30 يومًا بدون بطاقة ائتمان، وخصم ٢٠٪ في الاشتراك السنوي.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "أسعار جارفيكس — باقات من 99 ريالًا شهريًا",
    description: "باقات شفافة بلا مفاجآت: كل الخطط تشمل استضافة سحابية وتحديثات ونسخًا احتياطيًا يوميًا.",
    url: "/pricing",
    images: ["/og-image.png"],
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
