import { NextRequest, NextResponse } from "next/server";
import { createHmac, createCipheriv, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/core";

interface NormalizedStream {
  provider: string;
  url: string;
  quality: string;
  isM3U8: boolean;
  cookies: string;
}

// Provider priority — kiwi/ally first, bee last (flaky)
const PROVIDER_PRIORITY: Record<string, number> = {
  kiwi: 0,
  ally: 1,
  arc:  2,
  zoro: 3,
  jet:  4,
  bee:  5,
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

    console.log(`[/api/source] Fetching streams for: ${animeTitle} | Ep: ${episodeNum}`);

    const allStreams = await fetchMiruro(animeId, episodeNum);

    if (allStreams.length === 0) {
      return NextResponse.json({ error: "No playable streams found" }, { status: 404 });
    }

    // Group by provider (becomes the server selector in the player)
    const serverMap = new Map<string, NormalizedStream[]>();
    for (const stream of allStreams) {
      if (!serverMap.has(stream.provider)) serverMap.set(stream.provider, []);
      serverMap.get(stream.provider)!.push(stream);
    }

    const encryptionSecret = process.env.ENCRYPTION_SECRET;
    const tokenSecret = process.env.TOKEN_SECRET;
    if (!encryptionSecret || !tokenSecret) {
      throw new Error("ENCRYPTION_SECRET or TOKEN_SECRET is missing!");
    }

    const expiresAt = new Date(Date.now() + 30 * 60_000);
    const key = Buffer.from(encryptionSecret, "hex").subarray(0, 32);
    const finalServers = [];

    for (const [providerName, streams] of serverMap.entries()) {
      const tokenizedSources = await Promise.all(
        streams.map(async (source) => {
          const iv = randomBytes(16);
          const cipher = createCipheriv("aes-256-cbc", key, iv);
          const payload = JSON.stringify({ url: source.url, cookies: source.cookies });
          const encrypted = cipher.update(payload, "utf8", "hex") + cipher.final("hex");
          const encryptedUrl = iv.toString("hex") + ":" + encrypted;

          const tokenId = randomBytes(24).toString("hex");
          const signature = createHmac("sha256", tokenSecret)
            .update(tokenId + expiresAt.toISOString())
            .digest("hex");
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

          return {
            token: baseToken + ext,
            quality: source.quality,
            isM3U8: source.isM3U8,
          };
        })
      );

      finalServers.push({ name: providerName, sources: tokenizedSources });
    }

    console.log(`[/api/source] Compiled ${finalServers.length} servers for ${animeTitle} ep ${episodeNum}`);
    return NextResponse.json({ servers: finalServers });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}

// ── Miruro ───────────────────────────────────────────────────────────────────
// Tries MIRURO_API_URL first, falls back to MIRURO_API_URL_2 and _3 if set

async function fetchMiruro(animeId: number, episodeNum: number): Promise<NormalizedStream[]> {
  const urls = [
    process.env.MIRURO_API_URL,
    process.env.MIRURO_API_URL_2,
    process.env.MIRURO_API_URL_3,
  ].filter(Boolean) as string[];

  const apiKey = process.env.MIRURO_API_KEY ?? "";

  for (const baseUrl of urls) {
    try {
      console.log(`[fetchMiruro] Trying ${baseUrl}`);
      const streams = await fetchMiruroFromUrl(baseUrl, apiKey, animeId, episodeNum);
      if (streams.length > 0) {
        console.log(`[fetchMiruro] Got ${streams.length} streams from ${baseUrl}`);
        return streams;
      }
      console.log(`[fetchMiruro] No streams from ${baseUrl}, trying next...`);
    } catch (err) {
      console.log(`[fetchMiruro] ${baseUrl} failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  return [];
}

async function fetchMiruroFromUrl(
  baseUrl: string,
  apiKey: string,
  animeId: number,
  episodeNum: number
): Promise<NormalizedStream[]> {
  const epsRes = await fetch(`${baseUrl}/episodes/${animeId}`, {
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(12000),
  });

  if (!epsRes.ok) return [];
  const epsData = await epsRes.json();

  const allProviders = ["kiwi", "ally", "arc", "zoro", "jet", "bee"];
  const validStreams: NormalizedStream[] = [];

  await Promise.all(
    allProviders.map(async (provider) => {
      const subEps = epsData?.providers?.[provider]?.episodes?.sub;
      if (!Array.isArray(subEps)) return;

      const ep = subEps.find((e: { number: number; id: string }) => e.number === episodeNum);
      if (!ep?.id) return;

      try {
        const streamRes = await fetch(`${baseUrl}/${ep.id}`, {
          headers: { "x-api-key": apiKey },
          signal: AbortSignal.timeout(8000),
        });
        if (!streamRes.ok) return;

        const streamData = await streamRes.json();
        const hlsStreams = (streamData.streams ?? []).filter(
          (s: { type?: string; url?: string }) =>
            s.type === "hls" || s.url?.includes(".m3u8")
        );
        if (hlsStreams.length === 0) return;

        // Proper liveness check — verify it actually responds with a valid m3u8,
        // not just any HTTP 200 (catches bee/anikoto returning garbage)
        try {
          const checkRes = await fetch(hlsStreams[0].url, {
            method: "GET",
            headers: {
              "User-Agent": "Mozilla/5.0",
              "Referer": "https://kwik.cx/",
            },
            signal: AbortSignal.timeout(4000),
          });

          if (!checkRes.ok) return;

          const text = await checkRes.text();
          if (!text.includes("#EXTM3U")) {
            console.log(`[fetchMiruro] ${provider} failed m3u8 validation, skipping`);
            return;
          }
        } catch {
          return;
        }

        for (const s of hlsStreams) {
          validStreams.push({
            provider,
            url: s.url,
            quality: s.quality ? String(s.quality) : "auto",
            isM3U8: true,
            cookies: s.cookies ?? "",
          });
        }
      } catch {
        // provider timed out, skip silently
      }
    })
  );

  // Sort so kiwi/ally always appear first in the server selector
  return validStreams.sort(
    (a, b) => (PROVIDER_PRIORITY[a.provider] ?? 99) - (PROVIDER_PRIORITY[b.provider] ?? 99)
  );
}