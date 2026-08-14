export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDecipheriv, createCipheriv, randomBytes, createHmac } from "crypto";
import { db } from "@/lib/db";
import { checkProxyTarget } from "@/lib/ssrf-guard";
import { getClientIp } from "@/lib/request-ip";
import { deriveSegmentTokenId } from "@/lib/segment-token";
import { countRewritableUris, rewritePlaylist } from "@/lib/playlist-rewrite";

/**
 * Upper bound on URI-bearing lines we will rewrite from one upstream playlist.
 * Each one mints a SourceToken row, so this is the cap on DB writes per fetch.
 */
const MAX_PLAYLIST_URIS = 10_000;

interface Params { params: Promise<{ token: string }>; }

interface TokenInsertData {
  token: string; url: string; sessionId: string; ip: string; quality: string; isM3U8: boolean; expiresAt: Date; used: boolean;
}

function getProxyBase(_isPlaylist: boolean) {
  // Everything runs on the same VM now — no Vercel bandwidth to save.
  // Route all segment and playlist tokens through Next.js so the browser
  // never sees internal hostnames like host.docker.internal.
  return "/api/proxy";
}

export async function HEAD(req: NextRequest, { params }: Params) { return handleRequest(req, await params, true); }
export async function GET(req: NextRequest, { params }: Params) { return handleRequest(req, await params, false); }

async function handleRequest(req: NextRequest, params: { token: string }, isHead: boolean) {
  const cleanToken = params.token.replace(/\.(m3u8|mp4|ts|m4s|key|uwu)$/i, "");

  try {
    const record = await db.sourceToken.findUnique({ where: { token: cleanToken } });

    if (!record) return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    if (new Date() > record.expiresAt) return NextResponse.json({ error: "Token expired" }, { status: 410 });

    const requestIp = getClientIp(req);
    if (record.ip !== requestIp && record.ip !== "unknown") return NextResponse.json({ error: "IP mismatch" }, { status: 403 });

    const sessionId = req.cookies.get("session-id")?.value ?? req.cookies.get("site-auth")?.value ?? "anonymous";
    if (record.sessionId !== sessionId && record.sessionId !== "anonymous") return NextResponse.json({ error: "Session mismatch" }, { status: 403 });

    if (!record.isM3U8 && record.used) return NextResponse.json({ error: "Token already consumed" }, { status: 410 });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "*";

    if (isHead) {
      return new NextResponse(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": siteUrl,
          "Cache-Control": "no-store",
          "Content-Type": record.isM3U8 ? "application/x-mpegURL" : "video/mp4",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    const encryptionSecret = process.env.ENCRYPTION_SECRET;
    const tokenSecret = process.env.TOKEN_SECRET;
    if (!encryptionSecret || !tokenSecret) return NextResponse.json({ error: "Server config error" }, { status: 500 });

    const [ivHex, encryptedHex] = record.url.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const key = Buffer.from(encryptionSecret, "hex").subarray(0, 32);
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    const decryptedPayload = decipher.update(encryptedHex, "hex", "utf8") + decipher.final("utf8");

    let decryptedUrl: string;
    let cookies = "";
    let storedReferer = "";
    try {
      const parsed = JSON.parse(decryptedPayload);
      decryptedUrl = parsed.url;
      cookies = parsed.cookies || "";
      storedReferer = parsed.referer || "";
    } catch {
      decryptedUrl = decryptedPayload;
    }

    const targetUrl = new URL(decryptedUrl);

    // Block SSRF to internal/private/reserved targets. This single gate covers
    // both the playlist fetch and every segment fetch, since each rewritten
    // segment re-enters this handler and is re-checked here before any fetch.
    const targetVerdict = await checkProxyTarget(decryptedUrl);
    if (targetVerdict.blocked) {
      console.warn("[proxy] blocked target", { reason: targetVerdict.reason, url: decryptedUrl });
      return NextResponse.json({ error: "Blocked target" }, { status: 403 });
    }

    let referer = storedReferer
      ? (storedReferer.endsWith("/") ? storedReferer : storedReferer + "/")
      : "https://megaplay.buzz/";

    if (decryptedUrl.includes("kwik") || decryptedUrl.includes("owocdn") || decryptedUrl.includes("uwu.m3u8") || targetUrl.hostname.endsWith(".top")) {
      referer = "https://kwik.cx/";
    }

    const fetchHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": referer,
      "Origin": referer.replace(/\/$/, ""), 
      ...(cookies ? { Cookie: cookies } : {}),
    };

    if (record.isM3U8) {
      let playlistRes = await fetch(decryptedUrl, {
        headers: fetchHeaders,
        redirect: "manual", // re-check the redirect target for SSRF before following
        signal: req.signal // Abort if user navigates away
      });

      if (playlistRes.status >= 300 && playlistRes.status < 400) {
        const followed = await followRedirectOnce(playlistRes, decryptedUrl, fetchHeaders, req.signal);
        if (!followed) return NextResponse.json({ error: "Blocked target" }, { status: 403 });
        playlistRes = followed;
      }

      if (!playlistRes.ok) {
        console.error(`[proxy] upstream FAIL — ${playlistRes.status} ${playlistRes.statusText}`);
        console.error(`[proxy] url: ${decryptedUrl}`);
        console.error(`[proxy] referer used: ${fetchHeaders["Referer"]}`);
        console.error(`[proxy] origin used: ${fetchHeaders["Origin"]}`);
        return NextResponse.json({ error: `Failed to fetch playlist` }, { status: 502 });
      }

      const playlist = await playlistRes.text();
      const rewrittenLines: string[] = [];
      const tokensToInsert: TokenInsertData[] = [];

      // Bound the work a single upstream playlist can cause. Real media
      // playlists are hundreds of URIs (a 2h movie at 2s segments is ~3600);
      // anything past this is either malformed or hostile, and rewriting it
      // would mint a matching number of DB rows.
      const uriBearingLines = countRewritableUris(playlist);
      if (uriBearingLines > MAX_PLAYLIST_URIS) {
        console.error("[proxy] playlist too large — refusing to rewrite", {
          token: cleanToken.slice(0, 12),
          uriBearingLines,
          limit: MAX_PLAYLIST_URIS,
          url: decryptedUrl,
        });
        return NextResponse.json({ error: "Playlist too large" }, { status: 502 });
      }

      // Rewrites EVERY URI-bearing line, not just #EXT-X-KEY. #EXT-X-MAP
      // (fMP4 init), #EXT-X-MEDIA (separate audio/dub renditions) and
      // #EXT-X-SESSION-KEY used to pass through verbatim, so the browser hit
      // the origin CDN directly: CORS-blocked or hotlink-403'd, with the real
      // hostname exposed in the network tab. See lib/playlist-rewrite.ts.
      const resolveUrl = (uri: string) => {
        try { return new URL(uri, playlistRes.url).toString(); } catch { return uri; }
      };
      rewrittenLines.push(
        ...rewritePlaylist(playlist, resolveUrl, (absoluteUrl, ext) => {
          const tData = buildTokenData(absoluteUrl, cleanToken, record, key, tokenSecret, cookies, storedReferer, ext);
          tokensToInsert.push(tData.dbData);
          return tData.serveToken;
        }),
      );

      // skipDuplicates makes a replayed playlist a no-op instead of a fresh
      // batch of rows: segment token ids are now derived from
      // HMAC(parent token + segment URL), so the same playlist always produces
      // the same primary keys. Previously each fetch minted randomBytes(24)
      // ids that could never collide, so one token replayed for its 3h life
      // wrote hundreds of rows every time.
      if (tokensToInsert.length > 0) {
        await db.sourceToken.createMany({ data: tokensToInsert, skipDuplicates: true });
      }

      return new NextResponse(rewrittenLines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "application/x-mpegURL",
          "Access-Control-Allow-Origin": siteUrl,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    
    const rangeHeader = req.headers.get("range");
    if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

    // THE FIX: Listen to req.signal. If you skip ahead, the browser aborts the request.
    // This instantly kills the old Kwik download so the network doesn't get clogged!
    let streamRes = await fetch(decryptedUrl, {
      headers: fetchHeaders,
      redirect: "manual", // re-check the redirect target for SSRF before following
      signal: req.signal
    });

    if (streamRes.status >= 300 && streamRes.status < 400) {
      const followed = await followRedirectOnce(streamRes, decryptedUrl, fetchHeaders, req.signal);
      if (!followed) return NextResponse.json({ error: "Blocked target" }, { status: 403 });
      streamRes = followed;
    }

    if (!streamRes.ok && streamRes.status !== 206) {
      console.error(`[proxy/segment] FAIL ${streamRes.status} — url: ${decryptedUrl}`);
      console.error(`[proxy/segment] referer used: ${fetchHeaders["Referer"]}`);
      console.error(`[proxy/segment] stored referer was: ${storedReferer}`);
    }

    if (!streamRes.ok && streamRes.status !== 206) return NextResponse.json({ error: `Failed chunk fetch` }, { status: 502 });

    if (params.token.endsWith(".key")) {
      const keyBuffer = await streamRes.arrayBuffer();
      return new NextResponse(keyBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Access-Control-Allow-Origin": siteUrl,
          "Cache-Control": "public, max-age=31536000",
        }
      });
    }

    let finalContentType = streamRes.headers.get("content-type") ?? "video/mp2t";
    if (params.token.endsWith(".m3u8")) finalContentType = "application/x-mpegURL";

    const responseHeaders: Record<string, string> = {
      "Content-Type": finalContentType,
      "Access-Control-Allow-Origin": siteUrl,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };

    // THE FIX: Restore Content-Length specifically for video chunks!
    // This prevents the browser from downloading the entire 200MB file for a 50KB byte range!
    const cl = streamRes.headers.get("content-length"); 
    if (cl && !params.token.endsWith(".key") && !params.token.endsWith(".m3u8")) {
      responseHeaders["Content-Length"] = cl;
    }
    
    const cr = streamRes.headers.get("content-range"); if (cr) responseHeaders["Content-Range"] = cr;
    const ar = streamRes.headers.get("accept-ranges"); if (ar) responseHeaders["Accept-Ranges"] = ar;

    return new NextResponse(streamRes.body, { status: streamRes.status, headers: responseHeaders });
  } catch (err: unknown) {
    // Gracefully handle the AbortError so it doesn't spam your server logs when you skip
    if (err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"))) {
      return new NextResponse(null, { status: 499 }); // 499 = Client Closed Request
    }
    console.error("[/api/proxy] Error:", err instanceof Error ? err.stack : String(err));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Given a 3xx response, resolve its Location against the request URL, re-run the
// SSRF guard on it, and follow exactly ONE hop (no further redirects). Returns
// the followed response, or null if the redirect is missing/blocked/loops again
// (caller turns null into a 403).
async function followRedirectOnce(
  redirectRes: Response,
  baseUrl: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<Response | null> {
  const location = redirectRes.headers.get("location");
  if (!location) return null;

  let nextUrl: string;
  try {
    nextUrl = new URL(location, baseUrl).toString();
  } catch {
    return null;
  }

  const verdict = await checkProxyTarget(nextUrl);
  if (verdict.blocked) {
    console.warn("[proxy] blocked redirect target", { reason: verdict.reason, url: nextUrl });
    return null;
  }

  const res = await fetch(nextUrl, { headers, redirect: "manual", signal });
  if (res.status >= 300 && res.status < 400) return null; // only one hop allowed
  return res;
}

function buildTokenData(
  url: string, parentToken: string, record: { sessionId: string; ip: string; expiresAt: Date }, key: Buffer, tokenSecret: string, cookies: string, referer: string, explicitExt?: string
): { serveToken: string, dbData: TokenInsertData } {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const payload = JSON.stringify({ url, cookies, referer });
  const encrypted = cipher.update(payload, "utf8", "hex") + cipher.final("hex");
  const encryptedUrl = iv.toString("hex") + ":" + encrypted;

  // Deterministic, not random -- see lib/segment-token.ts for why.
  const tokenId = deriveSegmentTokenId(parentToken, url, tokenSecret);
  // Inherit the parent playlist token's expiry so a segment never expires mid-
  // episode while its playlist is still valid (the old fixed 15-min window
  // expired hundreds of segments out from under the player and stalled it).
  const expiresAt = record.expiresAt;
  const signature = createHmac("sha256", tokenSecret).update(tokenId + expiresAt.toISOString()).digest("hex");
  
  const baseToken = `${tokenId}.${signature}`;
  const isPlaylist = url.includes(".m3u8");
  let ext = explicitExt || ".ts";
  if (isPlaylist) ext = ".m3u8";

  const proxyBase = getProxyBase(isPlaylist);
  return {
    serveToken: `${proxyBase}/${baseToken}${ext}`,
    dbData: {
      token: baseToken, url: encryptedUrl, sessionId: record.sessionId, ip: record.ip, quality: "chunk", isM3U8: url.includes(".m3u8"), expiresAt, used: false 
    }
  };
}
