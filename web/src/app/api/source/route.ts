import { NextRequest, NextResponse } from "next/server";
import { createHmac, createCipheriv, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/core";

interface MiruroStream {
  url: string;
  type: string;
  quality: string;
  isM3U8?: boolean;
  cookies?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { animeTitle, episodeNum, animeId } = body as {
      animeTitle?: string;
      episodeNum?: number;
      animeId?: number;
    };

    if (!animeTitle || episodeNum == null || animeId == null) {
      return NextResponse.json(
        { error: "Missing required fields: animeTitle, episodeNum, animeId" },
        { status: 400 }
      );
    }

    const sessionId =
      req.cookies.get("session-id")?.value ??
      req.cookies.get("site-auth")?.value ??
      "anonymous";
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    if (!checkRateLimit(sessionId, 10, 60_000)) {
      return NextResponse.json(
        { error: "Rate limited — max 10 requests per minute" },
        { status: 429 }
      );
    }

    const MIRURO_API_URL = "https://miruro-api-qhis.onrender.com";
    const MIRURO_API_KEY = "fb6b36828b22617be219102d2a22e16a73c0784890b9536216ff4fd569ecc3b8";

    const epsRes = await fetch(`${MIRURO_API_URL}/episodes/${animeId}`, {
      headers: { "x-api-key": MIRURO_API_KEY },
      signal: AbortSignal.timeout(15000),
    });

    if (!epsRes.ok) {
      throw new Error(`Miruro API returned ${epsRes.status} on episodes fetch`);
    }

    const epsData = await epsRes.json();

    let episodeId = null;
    const providers = ["kiwi", "ally", "arc", "bee"];
    
    for (const provider of providers) {
      const subEps = epsData?.providers?.[provider]?.episodes?.sub;
      if (Array.isArray(subEps)) {
        const ep = subEps.find((e) => e.number === episodeNum);
        if (ep && ep.id) {
          episodeId = ep.id;
          break;
        }
      }
    }

    if (!episodeId) {
      return NextResponse.json({ error: "Episode not found on any provider" }, { status: 404 });
    }

    const streamRes = await fetch(`${MIRURO_API_URL}/${episodeId}`, {
      headers: { "x-api-key": MIRURO_API_KEY },
      signal: AbortSignal.timeout(15000),
    });

    if (!streamRes.ok) {
      throw new Error(`Miruro API returned ${streamRes.status} on stream fetch`);
    }

    const streamData = await streamRes.json();

    if (!streamData.streams || streamData.streams.length === 0) {
      return NextResponse.json({ error: "No playable streams found" }, { status: 404 });
    }

    const sources = streamData.streams
      .filter((s: MiruroStream) => s.type === "hls")
      .map((s: MiruroStream) => ({
        url: s.url,
        quality: s.quality,
        isM3U8: true,
        cookies: "",
      }));

    console.log(`[/api/source] Provider: Miruro, Fetched ${sources.length} sources successfully.`);

    const encryptionSecret = process.env.ENCRYPTION_SECRET;
    const tokenSecret = process.env.TOKEN_SECRET;

    if (!encryptionSecret || !tokenSecret) {
      console.error("[/api/source] Missing ENCRYPTION_SECRET or TOKEN_SECRET env vars");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const expiresAt = new Date(Date.now() + 30 * 60_000);

    const tokenizedSources = await Promise.all(
      sources.map(async (source: MiruroStream) => {
        const iv = randomBytes(16);
        const key = Buffer.from(encryptionSecret, "hex").subarray(0, 32);
        const cipher = createCipheriv("aes-256-cbc", key, iv);
        const payload = JSON.stringify({ url: source.url, cookies: source.cookies });
        let encrypted = cipher.update(payload, "utf8", "hex");
        encrypted += cipher.final("hex");
        const encryptedUrl = iv.toString("hex") + ":" + encrypted;

        const tokenId = randomBytes(24).toString("hex");

        const signature = createHmac("sha256", tokenSecret)
          .update(tokenId + expiresAt.toISOString())
          .digest("hex");

        const token = `${tokenId}.${signature}`;

        await db.sourceToken.create({
          data: {
            token,
            url: encryptedUrl,
            sessionId,
            ip,
            quality: source.quality,
            isM3U8: source.isM3U8 || true,
            expiresAt,
          },
        });

        return {
          token,
          quality: source.quality,
          isM3U8: source.isM3U8 || true,
        };
      })
    );

    return NextResponse.json({ sources: tokenizedSources });
  } catch (err) {
    console.error(
      "[/api/source] Unexpected error:",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}