import { NextRequest, NextResponse } from "next/server";
import { createHmac, createCipheriv, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/core";

interface MiruroStream {
  url: string;
  type: string;
  quality?: string;
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
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const sessionId = req.cookies.get("session-id")?.value ?? req.cookies.get("site-auth")?.value ?? "anonymous";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";

    if (!checkRateLimit(sessionId, 10, 60_000)) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }

    const MIRURO_API_URL = "https://miruro-api-qhis.onrender.com";
    const MIRURO_API_KEY = "fb6b36828b22617be219102d2a22e16a73c0784890b9536216ff4fd569ecc3b8";

    const epsRes = await fetch(`${MIRURO_API_URL}/episodes/${animeId}`, {
      headers: { "x-api-key": MIRURO_API_KEY },
      signal: AbortSignal.timeout(15000),
    });

    if (!epsRes.ok) throw new Error(`Miruro API returned ${epsRes.status} on episodes`);

    const epsData = await epsRes.json();

    const allProviders = ["zoro", "jet", "ally", "arc", "bee", "kiwi"];
    
    let finalSources = null;
    let successfulProvider = null;

    for (const provider of allProviders) {
      const subEps = epsData?.providers?.[provider]?.episodes?.sub;
      if (!Array.isArray(subEps)) continue;

      const ep = subEps.find((e: { number: number; id: string }) => e.number === episodeNum);
      if (!ep || !ep.id) continue;

      try {
        const streamRes = await fetch(`${MIRURO_API_URL}/${ep.id}`, {
          headers: { "x-api-key": MIRURO_API_KEY },
          signal: AbortSignal.timeout(10000), 
        });

        if (!streamRes.ok) continue;

        const streamData = await streamRes.json();
        
        if (!streamData.streams || streamData.streams.length === 0) continue;

        const hlsStreams = streamData.streams.filter((s: MiruroStream) => s.type === "hls" || s.url.includes(".m3u8"));
        
        if (hlsStreams.length > 0) {
          let isAlive = false;
          try {
            console.log(`[/api/source] Testing stream health for provider: ${provider}...`);
            await fetch(hlsStreams[0].url, {
              method: "GET",
              headers: { 
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Referer": "https://kwik.cx/"
              },
              signal: AbortSignal.timeout(4000) 
            });
            isAlive = true;
          } catch {
            console.log(`[/api/source] ❌ Stream for ${provider} is DEAD. Skipping to next...`);
          }

          if (!isAlive) continue; 

          finalSources = hlsStreams.map((s: MiruroStream) => ({
            url: s.url,
            quality: s.quality ? String(s.quality) : "auto", 
            // THE FIX: We filtered for HLS, so this is ALWAYS true. Stop trusting the API.
            isM3U8: true, 
            cookies: s.cookies || "",
          }));
          successfulProvider = provider;
          break; 
        }
      } catch {
        continue;
      }
    }

    if (!finalSources) return NextResponse.json({ error: "No playable streams found" }, { status: 404 });

    console.log(`[/api/source] Success! Provider '${successfulProvider}' served ${finalSources.length} ALIVE sources.`);

    const encryptionSecret = process.env.ENCRYPTION_SECRET;
    const tokenSecret = process.env.TOKEN_SECRET;

    if (!encryptionSecret || !tokenSecret) throw new Error("Missing Secrets!");

    const expiresAt = new Date(Date.now() + 30 * 60_000);

    const tokenizedSources = await Promise.all(
      finalSources.map(async (source: { url: string; cookies: string; quality: string; isM3U8: boolean }) => {
        try {
          const iv = randomBytes(16);
          const key = Buffer.from(encryptionSecret, "hex").subarray(0, 32);
          const cipher = createCipheriv("aes-256-cbc", key, iv);
          const payload = JSON.stringify({ url: source.url, cookies: source.cookies });
          const encrypted = cipher.update(payload, "utf8", "hex") + cipher.final("hex");
          const encryptedUrl = iv.toString("hex") + ":" + encrypted;

          const tokenId = randomBytes(24).toString("hex");
          const signature = createHmac("sha256", tokenSecret).update(tokenId + expiresAt.toISOString()).digest("hex");
          
          const baseToken = `${tokenId}.${signature}`;
          const ext = source.isM3U8 ? ".m3u8" : ".mp4"; 

          await db.sourceToken.create({
            data: {
              token: baseToken,
              url: encryptedUrl,
              sessionId,
              ip,
              quality: source.quality, 
              isM3U8: source.isM3U8,
              expiresAt,
            },
          });

          return { token: baseToken + ext, quality: source.quality, isM3U8: source.isM3U8 };
        } catch (dbError: unknown) {
          throw new Error(`DB Error`);
        }
      })
    );

    return NextResponse.json({ sources: tokenizedSources });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Vercel Crash: ${msg}` }, { status: 500 });
  }
}