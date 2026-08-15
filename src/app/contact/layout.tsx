import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "تواصل معنا · GarfiX",
  description: "تواصل مع فريق دعم GarfiX EOS — البريد الإلكتروني، الهاتف، الواتساب، أو أرسل لنا رسالة مباشرة.",
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
