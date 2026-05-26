import type { Metadata } from "next";
import { DM_Sans, Syne } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
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
  description: "I solo every other site btw jus bcus im that goated",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ),
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
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${syne.variable}`}>
      <body>
        <Nav />
        {children}
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
        <Script id="hta-banner" strategy="afterInteractive">{`(function(venjc){
var d = document,
    s = d.createElement('script'),
    l = d.scripts[d.scripts.length - 1];
s.settings = venjc || {};
s.src = "//deliciouslip.com/b/X.Vtsxd/Gnlw0TYbWkcr/yeHmM9gu/ZlUFl/kaPgTEcswrOyDPIQxnMIj/k/txNmzHAp4_MrjlEYzVMJwp";
s.async = true;
s.referrerPolicy = 'no-referrer-when-downgrade';
l.parentNode.insertBefore(s, l);
})({})`}</Script>
      </body>
    </html>
  );
}