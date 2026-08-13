import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
    tsconfigPath: './tsconfig.json'
  },
  output: "standalone",
  serverExternalPackages: [
    "playwright",
    "playwright-extra",
    "playwright-extra-plugin-stealth",
    "puppeteer-extra-plugin-stealth",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "s4.anilist.co" },
      { protocol: "https", hostname: "img.anili.st" },
      { protocol: "https", hostname: "cdn.discordapp.com" },
    ],
  },
  async headers() {
    return [
      // Agent-discovery Link headers now live in src/proxy.ts so they survive
      // the auth-gate redirect an unauthenticated agent gets on "/". Here we
      // only fix the content type of the extensionless api-catalog file.
      {
        source: "/.well-known/api-catalog",
        headers: [
          { key: "Content-Type", value: "application/linkset+json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
    ];
  },
};

export default nextConfig;