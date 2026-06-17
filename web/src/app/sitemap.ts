import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://www.thesupersuperanime.lol";

  const staticRoutes = [
    { url: base, priority: 1.0, changeFrequency: "daily" as const, lastModified: new Date() },
    { url: `${base}/search`, priority: 0.8, changeFrequency: "weekly" as const, lastModified: new Date() },
    { url: `${base}/leaderboard`, priority: 0.6, changeFrequency: "daily" as const, lastModified: new Date() },
    { url: `${base}/genres`, priority: 0.7, changeFrequency: "weekly" as const, lastModified: new Date() },
    { url: `${base}/issues`, priority: 0.5, changeFrequency: "weekly" as const, lastModified: new Date() },
  ];

  return staticRoutes;
}
