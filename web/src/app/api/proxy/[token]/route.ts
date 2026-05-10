import { NextRequest, NextResponse } from "next/server";
import { createDecipheriv, createCipheriv, randomBytes, createHmac } from "crypto";
import { db } from "@/lib/db";

interface Params {
  params: Promise<{ token: string }>;
}

interface TokenInsertData {
  token: string;
  url: string;
  sessionId: string;
  ip: string;
  quality: string;
  isM3U8: boolean;
  expiresAt: Date;
  used: boolean;
}

export async function HEAD(req: NextRequest, { params }: Params) {
  return handleRequest(req, await params, true);
}

export async function GET(req: NextRequest, { params }: Params) {
  return handleRequest(req, await params, false);
}

async function handleRequest(req: NextRequest, params: { token: string }, isHead: boolean) {
  const cleanToken = params.token.replace(/\.(m3u8|mp4|ts|m4s|key|uwu)$/i, "");

  try {
    const record = await db.sourceToken.findUnique({ where: { token: cleanToken } });

    if (!record) return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    if (new Date() > record.expiresAt) return NextResponse.json({ error: "Token expired" }, { status: 410 });

    const requestIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
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
    try {
      const parsed = JSON.parse(decryptedPayload);
      decryptedUrl = parsed.url;
      cookies = parsed.cookies || "";
    } catch {
      decryptedUrl = decryptedPayload;
    }

    // --- THE FIX: SMARTER KWIK DETECTION ---
    const targetUrl = new URL(decryptedUrl);
    let referer = targetUrl.origin + "/";
    
    // Check for "kwik", their known CDN "owocdn", the "uwu.m3u8" signature, or generic ".top" domains
    if (
      decryptedUrl.includes("kwik") || 
      decryptedUrl.includes("owocdn") || 
      decryptedUrl.includes("uwu.m3u8") ||
      targetUrl.hostname.endsWith(".top")
    ) {
      referer = "https://kwik.cx/";
    }

    const fetchHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": referer,
      "Origin": referer.replace(/\/$/, ""), // Turns "https://kwik.cx/" into "https://kwik.cx"
      ...(cookies ? { Cookie: cookies } : {}),
    };
    // ---------------------------------

    if (record.isM3U8) {
      const playlistRes = await fetch(decryptedUrl, {
        headers: fetchHeaders,
        signal: AbortSignal.timeout(10000),
      });

      if (!playlistRes.ok) {
        console.error(`[/api/proxy] M3U8 Fetch Failed: ${playlistRes.status} for URL: ${decryptedUrl}`);
        return NextResponse.json({ error: `Failed to fetch playlist: ${playlistRes.status}` }, { status: 502 });
      }

      const playlist = await playlistRes.text();
      const lines = playlist.split("\n");
      const rewrittenLines: string[] = [];
      const tokensToInsert: TokenInsertData[] = [];

      for (let line of lines) {
        const trimmed = line.trim();
        if (!trimmed) { rewrittenLines.push(line); continue; }

        if (trimmed.startsWith("#EXT-X-KEY:") && trimmed.includes('URI="')) {
          const match = trimmed.match(/URI="([^"]+)"/);
          if (match) {
            const originalUri = match[1];
            let keyUrl;
            try { keyUrl = new URL(originalUri, playlistRes.url).toString(); } catch { keyUrl = originalUri; }
            
            const tData = buildTokenData(keyUrl, record, key, tokenSecret, cookies);
            tokensToInsert.push(tData.dbData);
            line = line.replace(`URI="${originalUri}"`, `URI="/api/proxy/${tData.serveToken}"`);
          }
          rewrittenLines.push(line);
          continue;
        }

        if (trimmed.startsWith("#")) { rewrittenLines.push(line); continue; }

        let chunkUrl;
        try { chunkUrl = new URL(trimmed, playlistRes.url).toString(); } catch { chunkUrl = trimmed; }
        
        const tData = buildTokenData(chunkUrl, record, key, tokenSecret, cookies);
        tokensToInsert.push(tData.dbData);
        rewrittenLines.push(`/api/proxy/${tData.serveToken}`);
      }

      if (tokensToInsert.length > 0) {
        await db.sourceToken.createMany({ data: tokensToInsert });
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

    const streamRes = await fetch(decryptedUrl, { headers: fetchHeaders, signal: AbortSignal.timeout(30000) });

    const contentType = streamRes.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      console.error("[/api/proxy] Blocked by upstream! Target returned HTML instead of video.");
      return NextResponse.json({ error: "Upstream anti-bot protection triggered" }, { status: 502 });
    }

    if (!streamRes.ok && streamRes.status !== 206) return NextResponse.json({ error: `Failed to fetch source chunk: ${streamRes.status}` }, { status: 502 });

    const responseHeaders: Record<string, string> = {
      "Content-Type": streamRes.headers.get("content-type") ?? "video/mp2t",
      "Access-Control-Allow-Origin": siteUrl,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };

    const cl = streamRes.headers.get("content-length"); if (cl) responseHeaders["Content-Length"] = cl;
    const cr = streamRes.headers.get("content-range"); if (cr) responseHeaders["Content-Range"] = cr;
    const ar = streamRes.headers.get("accept-ranges"); if (ar) responseHeaders["Accept-Ranges"] = ar;

    return new NextResponse(streamRes.body, { status: streamRes.status, headers: responseHeaders });
  } catch (err) {
    console.error("[/api/proxy] Error:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function buildTokenData(
  url: string, 
  record: { sessionId: string; ip: string }, 
  key: Buffer, 
  tokenSecret: string, 
  cookies: string
): { serveToken: string, dbData: TokenInsertData } {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const payload = JSON.stringify({ url, cookies });
  const encrypted = cipher.update(payload, "utf8", "hex") + cipher.final("hex");
  const encryptedUrl = iv.toString("hex") + ":" + encrypted;

  const tokenId = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const signature = createHmac("sha256", tokenSecret).update(tokenId + expiresAt.toISOString()).digest("hex");
  
  const baseToken = `${tokenId}.${signature}`;
  
  let ext = ".ts";
  if (url.includes(".m3u8")) ext = ".m3u8";
  if (url.includes("key")) ext = ".key";

  return { 
    serveToken: baseToken + ext,
    dbData: {
      token: baseToken, 
      url: encryptedUrl, 
      sessionId: record.sessionId, 
      ip: record.ip, 
      quality: "chunk", 
      isM3U8: url.includes(".m3u8"), 
      expiresAt, 
      used: false 
    }
  };
}