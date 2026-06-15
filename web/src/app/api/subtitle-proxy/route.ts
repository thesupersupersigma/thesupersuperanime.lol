import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url param" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  // Only allow VTT files from known subtitle CDNs
  const allowedHosts = [
    "mewstream.buzz",
    "megaplay.buzz",
    "vidwish.live",
    "anineko.to",
    "anikototv.to",
    "cdn.mewstream.buzz",
    "s.megaplay.buzz",
    "lostproject.club",
    "watching.onl",
  ];
  const isAllowed = allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith("." + h));
  if (!isAllowed) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://megaplay.buzz/",
        "Origin": "https://megaplay.buzz",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 502 });
    }

    const text = await res.text();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "*";

    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Access-Control-Allow-Origin": siteUrl,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch subtitle" }, { status: 502 });
  }
}
