import { NextRequest, NextResponse } from "next/server";
import { createDecipheriv, createCipheriv, randomBytes, createHmac } from "crypto";
import { db } from "@/lib/db";

interface Params {
  params: Promise<{ token: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;

  try {
    const record = await db.sourceToken.findUnique({ where: { token } });

    if (!record) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }

    if (new Date() > record.expiresAt) {
      return NextResponse.json({ error: "Token expired" }, { status: 410 });
    }

    const requestIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    if (record.ip !== requestIp && record.ip !== "unknown") {
      return NextResponse.json({ error: "IP mismatch" }, { status: 403 });
    }

    const sessionId =
      req.cookies.get("session-id")?.value ??
      req.cookies.get("site-auth")?.value ??
      "anonymous";
    if (record.sessionId !== sessionId && record.sessionId !== "anonymous") {
      return NextResponse.json({ error: "Session mismatch" }, { status: 403 });
    }

    if (!record.isM3U8 && record.used) {
      return NextResponse.json({ error: "Token already consumed" }, { status: 410 });
    }

    const encryptionSecret = process.env.ENCRYPTION_SECRET;
    if (!encryptionSecret) {
      return NextResponse.json({ error: "Server config error" }, { status: 500 });
    }

    const [ivHex, encryptedHex] = record.url.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const key = Buffer.from(encryptionSecret, "hex").subarray(0, 32);
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    let decryptedPayload = decipher.update(encryptedHex, "hex", "utf8");
    decryptedPayload += decipher.final("utf8");

    let decryptedUrl: string;
    let cookies = "";
    try {
      const parsed = JSON.parse(decryptedPayload);
      decryptedUrl = parsed.url;
      cookies = parsed.cookies || "";
    } catch {
      decryptedUrl = decryptedPayload;
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "*";

    // ── Handle m3u8 playlists ───────────────────────────────────────────────
    if (record.isM3U8) {
      const playlistRes = await fetch(decryptedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://kwik.cx/",
          "Origin": "https://kwik.cx", // Added Origin to be super safe
          ...(cookies ? { Cookie: cookies } : {}),
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!playlistRes.ok) {
        return NextResponse.json({ error: `Failed to fetch playlist: ${playlistRes.status}` }, { status: 502 });
      }

      let playlist = await playlistRes.text();
      const lines = playlist.split("\n");
      const rewrittenLines: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();

        // If it's empty or a comment, leave it alone
        if (!trimmed || trimmed.startsWith("#")) {
          rewrittenLines.push(line);
          continue;
        }

        // It's a URI! Resolve it against the final URL in case Kwik redirected us
        let chunkUrl: string;
        try { 
          chunkUrl = new URL(trimmed, playlistRes.url).toString(); 
        } catch { 
          chunkUrl = trimmed; 
        }

        const chunkToken = await createChunkToken(
          chunkUrl, 
          record.sessionId, 
          record.ip, 
          encryptionSecret, 
          cookies
        );
        
        rewrittenLines.push(`/api/proxy/${chunkToken}`);
      }

      playlist = rewrittenLines.join("\n");

      return new NextResponse(playlist, {
        status: 200,
        headers: {
          "Content-Type": "application/x-mpegURL",
          "Access-Control-Allow-Origin": siteUrl,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // ── Handle raw stream chunks (video/mp2t) ───────────────────────────────
    const fetchHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://kwik.cx/",
      "Origin": "https://kwik.cx",
      ...(cookies ? { Cookie: cookies } : {}),
    };
    
    const rangeHeader = req.headers.get("range");
    if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

    const streamRes = await fetch(decryptedUrl, { 
      headers: fetchHeaders, 
      signal: AbortSignal.timeout(30000) 
    });

    if (!streamRes.ok && streamRes.status !== 206) {
      return NextResponse.json({ error: `Failed to fetch source chunk: ${streamRes.status}` }, { status: 502 });
    }

    const responseHeaders: Record<string, string> = {
      "Content-Type": streamRes.headers.get("content-type") ?? "video/mp4",
      "Access-Control-Allow-Origin": siteUrl,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };

    const contentLength = streamRes.headers.get("content-length");
    if (contentLength) responseHeaders["Content-Length"] = contentLength;
    const contentRange = streamRes.headers.get("content-range");
    if (contentRange) responseHeaders["Content-Range"] = contentRange;
    const acceptRanges = streamRes.headers.get("accept-ranges");
    if (acceptRanges) responseHeaders["Accept-Ranges"] = acceptRanges;

    return new NextResponse(streamRes.body, { 
      status: streamRes.status, 
      headers: responseHeaders 
    });
  } catch (err) {
    console.error("[/api/proxy] Error:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function createChunkToken(
  chunkUrl: string, 
  sessionId: string, 
  ip: string, 
  encryptionSecret: string, 
  cookies: string = ""
): Promise<string> {
  const tokenSecret = process.env.TOKEN_SECRET;
  if (!tokenSecret) throw new Error("TOKEN_SECRET not set");

  const iv = randomBytes(16);
  const key = Buffer.from(encryptionSecret, "hex").subarray(0, 32);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  
  const payload = JSON.stringify({ url: chunkUrl, cookies });
  let encrypted = cipher.update(payload, "utf8", "hex");
  encrypted += cipher.final("hex");
  const encryptedUrl = iv.toString("hex") + ":" + encrypted;

  const tokenId = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60_000); // Bumped to 15 mins
  const signature = createHmac("sha256", tokenSecret).update(tokenId + expiresAt.toISOString()).digest("hex");
  const token = `${tokenId}.${signature}`;

  // If the chunk is actually another playlist (master -> resolution playlist)
  const isM3U8 = chunkUrl.includes(".m3u8");

  await db.sourceToken.create({
    data: { 
      token, 
      url: encryptedUrl, 
      sessionId, 
      ip, 
      quality: "chunk", 
      isM3U8, 
      expiresAt, 
      used: false 
    },
  });

  return token;
}