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
}

// Provider priority — kiwi first (most reliable), ZORO last
// Names must match the exact keys returned by the Miruro API
const PROVIDER_PRIORITY: Record<string, number> = {
  kiwi:     0,
  ANIMEKAI: 1,
  ANIMEZ:   2,
  hop:      3,
  ZORO:     4,
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

    const { streams: allStreams, mirrorUsed, fallbackReason } = await fetchMiruro(animeId, episodeNum);

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

      finalServers.push({ name: providerName, type: streamType, sources: tokenizedSources });
    }

    console.log(`[/api/source] Compiled ${finalServers.length} servers for ${animeTitle} ep ${episodeNum}`);
    return NextResponse.json({ servers: finalServers, mirrorUsed, fallbackReason });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}

// ── Miruro ───────────────────────────────────────────────────────────────────
// Tries MIRURO_API_URL first, falls back to MIRURO_API_URL_2 and _3 if set

async function fetchMiruro(
  animeId: number,
  episodeNum: number
): Promise<{ streams: NormalizedStream[]; mirrorUsed: number; fallbackReason: string }> {
  const urls = [
    process.env.MIRURO_API_URL,
    process.env.MIRURO_API_URL_2,
    process.env.MIRURO_API_URL_3,
  ].filter(Boolean) as string[];

  const apiKey = process.env.MIRURO_API_KEY ?? "";
  // Records why mirror 1 (primary) failed, so we can surface it in the badge
  let firstFailureReason = "primary";

  for (let i = 0; i < urls.length; i++) {
    try {
      console.log(`[fetchMiruro] Trying ${urls[i]}`);
      const streams = await fetchMiruroFromUrl(urls[i], apiKey, animeId, episodeNum);
      if (streams.length > 0) {
        console.log(`[fetchMiruro] Got ${streams.length} streams from ${urls[i]}`);
        return {
          streams,
          mirrorUsed: i + 1, // 1-indexed: 1 = primary, 2 = mirror 2, …
          fallbackReason: i === 0 ? "primary" : firstFailureReason,
        };
      }
      console.log(`[fetchMiruro] No streams from ${urls[i]}, trying next...`);
      if (i === 0) firstFailureReason = "not_found";
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      console.log(`[fetchMiruro] ${urls[i]} failed: ${err instanceof Error ? err.message : err}`);
      if (i === 0) {
        firstFailureReason =
          name === "TimeoutError" || name === "AbortError" ? "timeout" : "error";
      }
    }
  }

  return { streams: [], mirrorUsed: 0, fallbackReason: firstFailureReason };
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

  // Exact provider IDs as returned by the Miruro API
  const allProviders = ["kiwi", "ANIMEKAI", "ANIMEZ", "hop", "ZORO"];
  const audioTypes = ["sub", "dub"] as const;
  const validStreams: NormalizedStream[] = [];

  await Promise.all(
    allProviders.flatMap((provider) =>
      audioTypes.map(async (audioType) => {
        const eps = epsData?.providers?.[provider]?.episodes?.[audioType];
        if (!Array.isArray(eps)) return;

        const ep = eps.find((e: { number: number; id: string }) => e.number === episodeNum);
        if (!ep?.id) return;

        try {
          const streamRes = await fetch(`${baseUrl}/${ep.id}`, {
            headers: { "x-api-key": apiKey },
            signal: AbortSignal.timeout(8000),
          });
          if (!streamRes.ok) return;

          const streamData = await streamRes.json();
          // The hop provider returns a different response shape:
          //   streamData.ssub.streams (sub) or streamData.sdub.streams (dub)
          // All other providers use streamData.streams directly.
          const rawStreams: unknown[] =
            streamData.streams ??
            (audioType === "sub" ? streamData.ssub?.streams : streamData.sdub?.streams) ??
            [];
          const hlsStreams = rawStreams.filter(
            (s: unknown) => {
              const stream = s as { type?: string; url?: string };
              return stream.type === "hls" || stream.url?.includes(".m3u8");
            }
          );
          if (hlsStreams.length === 0) return;

          // Liveness check — verify the HLS URL actually responds.
          // We check for #EXTM3U but fall back to accepting any 200 OK,
          // since some providers (ANIMEKAI, ANIMEZ, hop, ZORO) may serve
          // valid streams that require specific headers or don't return
          // the playlist inline on a bare GET.
          const firstStream = hlsStreams[0] as { url: string; referer?: string; quality?: string | number; cookies?: string };
          const liveReferer = firstStream.referer ?? "https://kwik.cx/";
          try {
            const checkRes = await fetch(firstStream.url, {
              method: "GET",
              headers: {
                "User-Agent": "Mozilla/5.0",
                "Referer": liveReferer,
                "Origin": new URL(liveReferer).origin,
              },
              signal: AbortSignal.timeout(4000),
            });

            if (!checkRes.ok) {
              console.log(`[fetchMiruro] ${provider}/${audioType} liveness FAIL — HTTP ${checkRes.status}`);
              return;
            }

            const text = await checkRes.text();
            if (text.includes("#EXTM3U")) {
              console.log(`[fetchMiruro] ${provider}/${audioType} liveness PASS (valid m3u8)`);
            } else {
              // Accept the stream anyway — provider responded 200 but may need
              // the player to negotiate headers at playback time
              console.log(`[fetchMiruro] ${provider}/${audioType} liveness PASS (200 OK, no #EXTM3U — accepted)`);
            }
          } catch (liveErr) {
            console.log(`[fetchMiruro] ${provider}/${audioType} liveness FAIL — ${liveErr instanceof Error ? liveErr.message : liveErr}`);
            return;
          }

          for (const _s of hlsStreams) {
            const s = _s as { url: string; quality?: string | number; cookies?: string };
            validStreams.push({
              provider,
              type: audioType,
              url: s.url,
              quality: s.quality ? String(s.quality) : "auto",
              isM3U8: true,
              cookies: s.cookies ?? "",
            });
          }
        } catch {
          // provider timed out or errored, skip silently
        }
      })
    )
  );

  // Sort so kiwi/ally always appear first in the server selector
  return validStreams.sort(
    (a, b) => (PROVIDER_PRIORITY[a.provider] ?? 99) - (PROVIDER_PRIORITY[b.provider] ?? 99)
  );
}