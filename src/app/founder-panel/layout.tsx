import { FounderGuard } from "@/components/garfix/FounderGuard";

export default function FounderPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FounderGuard>{children}</FounderGuard>;
}
