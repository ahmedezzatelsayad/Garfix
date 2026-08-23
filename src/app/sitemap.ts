import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://garfix.app";
  const now = new Date();

  const staticRoutes = [
    "",
    "/features",
    "/pricing",
    "/about",
    "/login",
    "/signup",
    "/privacy",
    "/terms",
    "/refund",
    "/cookies",
    "/help",
    "/contact",
    "/partners",
    "/status",
  ];

  return staticRoutes.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? ("daily" as const) : ("monthly" as const),
    // الصفحة الرئيسية + المميزات + الأسعار هي صفحات التحويل الأساسية — أولوية أعلى
    priority: path === "" ? 1 : ["/features", "/pricing"].includes(path) ? 0.9 : 0.5,
  }));
}
