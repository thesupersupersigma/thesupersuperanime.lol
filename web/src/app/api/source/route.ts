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
}

const PROVIDER_PRIORITY: Record<string, number> = {
  anikoto: 0,
  anineko: 1,
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

    const { streams: allStreams, mirrorUsed, fallbackReason } = await fetchAnivexa(animeId, episodeNum);

    if (allStreams.length === 0) {
      return NextResponse.json({ error: "No playable streams found" }, { status: 404 });
    }

    // Group by provider + type (e.g. "kiwi:sub", "kiwi:dub")
    const serverMap = new Map<string, NormalizedStream[]>();
    for (const stream of allStreams) {
      const key = `${stream.provider}:${stream.type}`;
      if (!serverMap.has(key)) serverMap.set(key, []);
      serverMap.get(key)!.push(stream);
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

    for (const [mapKey, streams] of serverMap.entries()) {
      const [providerName, streamType] = mapKey.split(":") as [string, "sub" | "dub"];
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

      finalServers.push({ name: providerName, type: streamType, sources: tokenizedSources });
    }

    console.log(`[/api/source] Compiled ${finalServers.length} servers for ${animeTitle} ep ${episodeNum}`);
    return NextResponse.json({ servers: finalServers, mirrorUsed, fallbackReason });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}

async function fetchAnivexa(
  animeId: number,
  episodeNum: number
): Promise<{ streams: NormalizedStream[]; mirrorUsed: number; fallbackReason: string }> {
  const baseUrl = process.env.ANIVEXA_API_URL;
  if (!baseUrl) throw new Error("ANIVEXA_API_URL is not set");

  try {
    const streams = await fetchAnevixaFromUrl(baseUrl, animeId, episodeNum);
    if (streams.length > 0) {
      return { streams, mirrorUsed: 1, fallbackReason: "primary" };
    }
    return { streams: [], mirrorUsed: 0, fallbackReason: "not_found" };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const reason = name === "TimeoutError" || name === "AbortError" ? "timeout" : "error";
    return { streams: [], mirrorUsed: 0, fallbackReason: reason };
  }
}

async function fetchAnevixaFromUrl(
  baseUrl: string,
  animeId: number,
  episodeNum: number
): Promise<NormalizedStream[]> {
  const epsRes = await fetch(`${baseUrl}/episodes/${animeId}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!epsRes.ok) return [];
  const epsData = await epsRes.json();

  const providers = ["anikoto", "anineko"] as const;
  const audioTypes = ["sub", "dub"] as const;
  const validStreams: NormalizedStream[] = [];

  await Promise.all(
    providers.flatMap((provider) =>
      audioTypes.map(async (audioType) => {
        const eps = epsData?.[provider]?.episodes?.[audioType];
        if (!Array.isArray(eps)) return;

        const ep = eps.find((e: { number: number; id: string }) => e.number === episodeNum);
        if (!ep?.id) return;

        try {
          const watchRes = await fetch(`${baseUrl}/${ep.id}`, {
            signal: AbortSignal.timeout(15000),
          });
          if (!watchRes.ok) return;
          const watchData = await watchRes.json();

          // anikoto returns ssub.streams / sdub.streams
          // anineko returns streams directly
          const rawStreams: unknown[] =
            watchData.streams ??
            (audioType === "sub" ? watchData.ssub?.streams : watchData.sdub?.streams) ??
            [];

          const hlsStreams = rawStreams.filter((s: unknown) => {
            const stream = s as { type?: string; url?: string };
            return stream.type === "hls";
          });
          if (hlsStreams.length === 0) return;

          for (const _s of hlsStreams) {
            const s = _s as { url: string; quality?: string | number; referer?: string };
            validStreams.push({
              provider,
              type: audioType,
              url: s.url,
              quality: s.quality ? String(s.quality) : "auto",
              isM3U8: true,
              cookies: "",
              referer: s.referer ?? "",
            });
          }
        } catch {
          // provider timed out or errored, skip silently
        }
      })
    )
  );

  return validStreams.sort(
    (a, b) => (PROVIDER_PRIORITY[a.provider] ?? 99) - (PROVIDER_PRIORITY[b.provider] ?? 99)
  );
}