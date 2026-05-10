import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
    tsconfigPath: './tsconfig.json'
  },
  transpilePackages: ["@tsss/core"],
  serverExternalPackages: [
    "playwright",
    "playwright-extra",
    "playwright-extra-plugin-stealth",
    "puppeteer-extra-plugin-stealth",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "s4.anilist.co",
      },
      {
        protocol: "https",
        hostname: "img.anili.st",
      },
    ],
  },
};

export default nextConfig;