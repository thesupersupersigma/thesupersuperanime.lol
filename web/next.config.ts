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
      { protocol: "https", hostname: "s4.anilist.co" },
      { protocol: "https", hostname: "img.anili.st" },
      { protocol: "https", hostname: "cdn.discordapp.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Link",
            value: [
              '</sitemap.xml>; rel="sitemap"',
              '</llms.txt>; rel="describedby"; type="text/plain"',
              '</.well-known/mcp/server-card.json>; rel="mcp-server-card"',
              '</.well-known/agent-skills/index.json>; rel="agent-skills"',
            ].join(", "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;