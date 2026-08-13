import { NextRequest, NextResponse } from "next/server";
import { readCappedText } from "@/lib/read-capped";

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
    "cdn.anizara.store",
  ];
  const isAllowed = allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith("." + h));
  if (!isAllowed) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  const isAnizara = parsed.hostname.includes("anizara.store");
  const referer = isAnizara ? "https://anineko.to/" : "https://megaplay.buzz/";
  const origin = isAnizara ? "https://anineko.to" : "https://megaplay.buzz";

  const fetchHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": referer,
    "Origin": origin,
  };

  try {
    let res = await fetch(url, {
      headers: fetchHeaders,
      redirect: "manual", // re-check the redirect target against the allowlist before following
      signal: AbortSignal.timeout(10000),
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return NextResponse.json({ error: "Blocked redirect" }, { status: 403 });

      let nextUrl: URL;
      try {
        nextUrl = new URL(location, url);
      } catch {
        return NextResponse.json({ error: "Invalid redirect" }, { status: 403 });
      }

      const redirectAllowed = allowedHosts.some(h => nextUrl.hostname === h || nextUrl.hostname.endsWith("." + h));
      if (!redirectAllowed) return NextResponse.json({ error: "Redirect host not allowed" }, { status: 403 });

      res = await fetch(nextUrl.toString(), {
        headers: fetchHeaders,
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      });

      if (res.status >= 300 && res.status < 400) {
        return NextResponse.json({ error: "Too many redirects" }, { status: 403 });
      }
    }

    if (!res.ok) {
      return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 502 });
    }

    // Byte cap. This route is public, unauthenticated and unrated, and the
    // allowlist constrains only the HOSTNAME — the path is entirely
    // attacker-chosen. `await res.text()` with no cap meant any large file on
    // an allowed CDN could be buffered into RAM (doubled by the UTF-8 decode),
    // and a handful of concurrent requests could OOM the server. The 10s
    // timeout bounds wall clock, not bytes.
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_SUBTITLE_BYTES) {
      console.warn("[subtitle-proxy] rejected oversized subtitle", {
        url, declaredBytes: declared, limit: MAX_SUBTITLE_BYTES,
      });
      return NextResponse.json({ error: "Subtitle too large" }, { status: 413 });
    }

    // Content-Length is advisory (and absent on chunked responses), so also
    // count bytes as they arrive and abort past the cap.
    const text = await readCappedText(res.body, MAX_SUBTITLE_BYTES, (bytesRead) => {
      console.warn("[subtitle-proxy] aborted oversized subtitle mid-stream", {
        url, bytesRead, limit: MAX_SUBTITLE_BYTES,
      });
    });
    if (text === null) {
      return NextResponse.json({ error: "Subtitle too large" }, { status: 413 });
    }
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

/**
 * Largest subtitle we'll relay. A dense feature-length VTT is well under
 * 500 KB; 2 MB leaves generous headroom while keeping the buffer bounded.
 */
const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024;
