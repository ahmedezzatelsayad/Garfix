import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "من نحن — قصتنا من الكويت",
  description:
    "تعرّف على فريق جارفيكس: رؤيتنا ورسالتنا وقيمتنا ورحلتنا من ورشة صغيرة في الكويت إلى منصة أعمال تخدم أكثر من 20 دولة عربية بالفوترة الإلكترونية المعتمدة.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "من نحن — قصة جارفيكس من الكويت",
    description: "نبني منصة تليق بأصحاب الأعمال العرب: عالمية المستوى، عربية اللغة والعملة والأنظمة.",
    url: "/about",
    images: ["/og-image.png"],
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
