import { NextRequest, NextResponse } from "next/server";
import { createHmac, createCipheriv, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/core";

interface NormalizedStream {
  provider: string;
  type: "sub" | "dub";
  url: string;
  quality: string;
  isM3U8: boolean;
  cookies: string;
  referer: string;
  subtitles: { url: string; language: string; label: string; default: boolean }[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { episodeNum, animeId } = body as {
      episodeNum?: number;
      animeId?: number;
    };

    if (episodeNum == null || animeId == null) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const sessionId = req.cookies.get("session-id")?.value ?? req.cookies.get("site-auth")?.value ?? "anonymous";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";

    if (!checkRateLimit(sessionId, 10, 60_000)) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }

    console.log(`[/api/source] Fetching streams for animeId: ${animeId} | Ep: ${episodeNum}`);

    let allStreams: NormalizedStream[] = [];
    let fallbackReason = "primary";
    try {
      allStreams = await fetchScraper(animeId, episodeNum);
      if (allStreams.length === 0) fallbackReason = "not_found";
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      fallbackReason = name === "TimeoutError" || name === "AbortError" ? "timeout" : "error";
    }

    if (allStreams.length === 0) {
      return NextResponse.json({ error: "No playable streams found" }, { status: 404 });
    }

    // Group streams per audio type (each type comes from a single provider)
    const typeMap = new Map<string, NormalizedStream[]>();
    for (const type of ["sub", "dub"] as const) {
      const streamsOfType = allStreams.filter(s => s.type === type);
      if (streamsOfType.length === 0) continue;
      typeMap.set(type, streamsOfType);
    }

    const encryptionSecret = process.env.ENCRYPTION_SECRET;
    const tokenSecret = process.env.TOKEN_SECRET;
    if (!encryptionSecret || !tokenSecret) {
      throw new Error("ENCRYPTION_SECRET or TOKEN_SECRET is missing!");
    }

    // Cover a full viewing session (episode + pauses); segment tokens minted by
    // the proxy inherit this same expiry so the whole playback shares one window.
    const expiresAt = new Date(Date.now() + 3 * 60 * 60_000);
    const encKey = Buffer.from(encryptionSecret, "hex").subarray(0, 32);
    const finalServers = [];

    for (const [streamType, streams] of typeMap.entries()) {
      const providerName = streams[0].provider;
      const tokenizedSources = await Promise.all(
        streams.map(async (source) => {
          const iv = randomBytes(16);
          const cipher = createCipheriv("aes-256-cbc", encKey, iv);
          const payload = JSON.stringify({ url: source.url, cookies: source.cookies, referer: source.referer ?? "" });
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

      const seen = new Set<string>();
      const dedupedSubtitles = (streams[0].subtitles ?? []).filter(s => {
        if (seen.has(s.language)) return false;
        seen.add(s.language);
        return true;
      });
      finalServers.push({
        name: providerName,
        type: streamType as "sub" | "dub",
        sources: tokenizedSources,
        subtitles: dedupedSubtitles,
      });
    }

    console.log(`[/api/source] Compiled ${finalServers.length} servers for animeId ${animeId} ep ${episodeNum}`);
    return NextResponse.json({ servers: finalServers, fallbackReason });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}

async function fetchScraper(
  animeId: number,
  episodeNum: number
): Promise<NormalizedStream[]> {
  const baseUrl = process.env.SCRAPER_API_URL;
  if (!baseUrl) throw new Error("SCRAPER_API_URL is not set");

  const epsRes = await fetch(`${baseUrl}/episodes/${animeId}`, {
    signal: AbortSignal.timeout(45000),
  });
  if (!epsRes.ok) return [];
  const result = (await epsRes.json()) as {
    provider: string | null;
    providerId: string;
    episodes: { id: string; number: number; title?: string }[];
    reason?: string;
  };

  if (!result.provider || !Array.isArray(result.episodes) || result.episodes.length === 0) {
    return [];
  }

  const ep = result.episodes.find((e) => e.number === episodeNum);
  if (!ep) return [];

  const watchRes = await fetch(
    `${baseUrl}/watch?provider=${encodeURIComponent(result.provider)}&episodeId=${encodeURIComponent(ep.id)}`,
    { signal: AbortSignal.timeout(20000) }
  );
  if (!watchRes.ok) return [];
  const watch = (await watchRes.json()) as {
    sub: ScraperResult | null;
    dub: ScraperResult | null;
  };

  const provider = result.provider.toLowerCase();
  const streams: NormalizedStream[] = [];

  for (const type of ["sub", "dub"] as const) {
    const watchResult = watch[type];
    if (!watchResult) continue;

    const subtitles = (watchResult.subtitles ?? []).map((sub) => ({
      url: sub.url,
      language: sub.lang,
      label: sub.lang,
      default: false,
    }));

    for (const source of watchResult.sources ?? []) {
      streams.push({
        provider,
        type,
        url: source.url,
        quality: source.quality,
        isM3U8: source.isM3U8,
        cookies: "",
        referer: watchResult.headers?.Referer ?? "",
        subtitles,
      });
    }
  }

  return streams;
}

interface ScraperResult {
  sources: { url: string; quality: string; isM3U8: boolean }[];
  subtitles: { url: string; lang: string }[];
  headers: { Referer?: string };
}
