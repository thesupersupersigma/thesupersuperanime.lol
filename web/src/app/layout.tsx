import type { Metadata } from "next";
import { DM_Sans, Syne } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { BadgeToastProvider } from "@/components/badges/BadgeToastProvider";
import Script from "next/script";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "thesupersuperanime",
  description: "I solo every other site btw jus bcus im that goated.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ),
  openGraph: {
    title: "thesupersuperanime",
    description: "I solo every other site btw jus bcus im that goated.",
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://thesupersuperanime.lol",
    siteName: "thesupersuperanime",
    type: "website",
    images: [
      {
        url: "/banner.png",
        width: 1200,
        height: 630,
        alt: "thesupersuperanime",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "thesupersuperanime",
    description: "I solo every other site btw jus bcus im that goated.",
    images: ["/banner.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  other: {
    referrer: "no-referrer-when-downgrade",
    "794d5429a9f3fc1e88336d09f22103435994976e": "794d5429a9f3fc1e88336d09f22103435994976e",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${syne.variable}`}>
      <body>
        <Nav />
        <BadgeToastProvider>{children}</BadgeToastProvider>
        {process.env.NEXT_PUBLIC_ADS_ENABLED === "true" && (
          <>
            <Script id="hta-inpage" strategy="afterInteractive">{`(function(egki){
var d = document,
    s = d.createElement('script'),
    l = d.scripts[d.scripts.length - 1];
s.settings = egki || {};
s.src = "//deliciouslip.com/bjXdV.sfdkG/lp0TY/WCcs/Yecmw9GucZiU/lbkWPmTOcdwNOmD/IIxLNSjHE/twNDzvAL4eM_jFEd2cN/Qa";
s.async = true;
s.referrerPolicy = 'no-referrer-when-downgrade';
l.parentNode.insertBefore(s, l);
})({})`}</Script>
            <Script id="hta-video-slider" strategy="afterInteractive">{`(function(ixys){
var d = document,
    s = d.createElement('script'),
    l = d.scripts[d.scripts.length - 1];
s.settings = ixys || {};
s.src = "//deliciouslip.com/bhX.Vgs/djG_lJ0/YTWHcB/Mepm/9Su/ZwUclEkXPiTlcBwoO/DUIKxLN/DfUbtUNTzYAK4-MCjJER0DOEQh";
s.async = true;
s.referrerPolicy = 'no-referrer-when-downgrade';
l.parentNode.insertBefore(s, l);
})({})`}</Script>
          </>
        )}
        <Script id="webmcp" strategy="afterInteractive">{`
  if ('modelContext' in navigator) {
    navigator.modelContext.provideContext({
      tools: [
        {
          name: "search_anime",
          description: "Search for anime on thesupersuperanime.lol by title or filters",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Anime title or keyword to search for" }
            }
          },
          execute: async ({ query }) => {
            window.location.href = "/search?q=" + encodeURIComponent(query || "");
          }
        },
        {
          name: "go_to_anime",
          description: "Navigate to an anime detail page by AniList ID",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "The AniList anime ID" }
            },
            required: ["id"]
          },
          execute: async ({ id }) => {
            window.location.href = "/anime/" + id;
          }
        },
        {
          name: "watch_episode",
          description: "Navigate to watch a specific episode of an anime",
          inputSchema: {
            type: "object",
            properties: {
              animeId: { type: "string", description: "The AniList anime ID" },
              episodeNum: { type: "number", description: "Episode number to watch" }
            },
            required: ["animeId", "episodeNum"]
          },
          execute: async ({ animeId, episodeNum }) => {
            window.location.href = "/watch/" + animeId + "/" + episodeNum;
          }
        }
      ]
    }).catch(() => {});
  }
`}</Script>
      </body>
    </html>
  );
}