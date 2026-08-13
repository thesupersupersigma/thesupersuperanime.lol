import { NextRequest, NextResponse } from "next/server";
import { createHmac, createCipheriv, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/core";
import { getClientIp } from "@/lib/request-ip";
import {
  buildProviderQueue,
  buildWatchCalls,
  pendingProviders,
  providerKey,
  verifyEpisodeResponse,
  type EpisodeRef,
} from "./provider-pairing";

interface NormalizedStream {
  provider: string;
  type: "sub" | "dub";
  /** the real source-site server this stream came from (e.g. "HD-1", "VidCloud"); "" for
   *  providers that don't yet report one (single-server fallback). */
  serverName: string;
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

    // Validate/coerce inputs before they reach the scraper URL. animeId is
    // interpolated into a path (`/info/${id}`), so reject anything that isn't a
    // positive integer to block path-bearing/string injection.
    const id = Number(animeId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid animeId" }, { status: 400 });
    }

    const ep = Number(episodeNum);
    if (!Number.isInteger(ep)) {
      return NextResponse.json({ error: "Invalid episodeNum" }, { status: 400 });
    }

    const sessionId = req.cookies.get("session-id")?.value ?? req.cookies.get("site-auth")?.value ?? "anonymous";
    const ip = getClientIp(req);

    if (!checkRateLimit(sessionId, 10, 60_000)) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }

    console.log(`[/api/source] Fetching streams for animeId: ${id} | Ep: ${ep}`);

    let allStreams: NormalizedStream[] = [];
    let fallbackReason = "primary";
    try {
      allStreams = await fetchScraper(id, ep);
      if (allStreams.length === 0) fallbackReason = "not_found";
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      fallbackReason = name === "TimeoutError" || name === "AbortError" ? "timeout" : "error";
    }

    if (allStreams.length === 0) {
      return NextResponse.json({ error: "No playable streams found" }, { status: 404 });
    }

    // Group streams per provider + audio type + real server name, so each distinct server the
    // provider offers becomes its own selectable entry. Keying only on provider+type would
    // merge multiple real servers (HD-1, VidCloud, …) into one fake entry with several sources;
    // including serverName keeps them separate. Providers that report no serverName ("") still
    // collapse to a single entry per provider+type, exactly as before.
    const typeMap = new Map<string, NormalizedStream[]>();
    for (const stream of allStreams) {
      const key = `${stream.provider}:${stream.type}:${stream.serverName}`;
      const existing = typeMap.get(key);
      if (existing) existing.push(stream);
      else typeMap.set(key, [stream]);
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

    for (const streams of typeMap.values()) {
      // All streams in a group share the same provider/type/serverName; read them off the first
      // rather than re-splitting the map key (serverName could contain a ":").
      const { provider: providerName, type: streamType, serverName } = streams[0];
      const providerLabel = providerName.charAt(0).toUpperCase() + providerName.slice(1);
      // Incorporate the real server name so multi-server providers are distinguishable in the
      // dropdown (e.g. "Anikototv — HD-1", "Anikototv — VidCloud"). Providers that report no
      // server name fall back to just the provider label — unchanged from before.
      const displayName = serverName ? `${providerLabel} — ${serverName}` : providerLabel;
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
        name: displayName,
        type: streamType,
        sources: tokenizedSources,
        subtitles: dedupedSubtitles,
      });
    }

    console.log(`[/api/source] Compiled ${finalServers.length} servers for animeId ${id} ep ${ep}`);
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

  // Fire /info (provider list) and primary /episodes (best provider) concurrently.
  const [infoRes, primaryEpsRes] = await Promise.allSettled([
    fetch(`${baseUrl}/info/${animeId}`, { signal: AbortSignal.timeout(15000) })
      .then(r => r.ok ? r.json() : null) as Promise<{ mappings: { provider: string; id: string; title: string; score: number }[] } | null>,
    fetch(`${baseUrl}/episodes/${animeId}`, { signal: AbortSignal.timeout(30000) })
      .then(r => r.ok ? r.json() : null) as Promise<{ provider: string | null; episodes: { id: string; number: number }[] } | null>,
  ]);

  const info = infoRes.status === "fulfilled" ? infoRes.value : null;
  const primaryEps = primaryEpsRes.status === "fulfilled" ? primaryEpsRes.value : null;

  console.log(`[source] /info result:`, JSON.stringify(info?.mappings?.map(m => m.provider)));
  console.log(`[source] primary /episodes provider:`, primaryEps?.provider, `episodes:`, primaryEps?.episodes?.length ?? 0);

  // Build the set of providers to query. Start with the primary winner so it goes first.
  // Then add all providers from /info mappings that we haven't tried yet.
  const providerQueue = buildProviderQueue(primaryEps, info);

  console.log(`[source] providerQueue:`, providerQueue);

  if (providerQueue.length === 0) return [];

  const episodesByProvider = new Map<string, EpisodeRef[]>();

  // The unqualified /episodes call above already answered for one provider —
  // but only file it if the response actually names which one. A `provider:
  // null` body can't be attributed to anybody, so its episode ids are unusable
  // for a `/watch?provider=` call and must be dropped rather than guessed at.
  if (primaryEps?.provider && primaryEps.episodes?.length) {
    episodesByProvider.set(providerKey(primaryEps.provider), primaryEps.episodes);
  }

  // Fetch episode lists for whatever is still missing. Keyed on what we
  // actually hold, not on queue position — the old `slice(1)` silently dropped
  // the top-ranked provider whenever the primary call failed or returned a null
  // provider, since index 0 was then an /info mapping that had never been fetched.
  const secondaryProviders = pendingProviders(providerQueue, episodesByProvider);
  if (secondaryProviders.length > 0) {
    const epsResults = await Promise.allSettled(
      secondaryProviders.map((provider) =>
        fetch(`${baseUrl}/episodes/${animeId}?provider=${encodeURIComponent(provider)}`, {
          signal: AbortSignal.timeout(20000),
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => ({ provider, data }))
      )
    );
    for (const result of epsResults) {
      if (result.status !== "fulfilled") continue;
      const { provider, data } = result.value;

      // Trust the provider the API says answered, never the one we asked for.
      // An aggregator fallback body filed under the requested name is what
      // produced AniNeko-shaped ids on ReAnime /watch calls -> intermittent 400s.
      const verdict = verifyEpisodeResponse(provider, data);
      if (!verdict.accepted) continue;

      episodesByProvider.set(verdict.answered, verdict.episodes);
    }
  }

  console.log(`[source] episodesByProvider keys:`, [...episodesByProvider.keys()]);

  // For each provider that has episodes, find the requested episode and fire /watch in parallel.
  const watchCalls = buildWatchCalls(providerQueue, episodesByProvider, episodeNum);

  console.log(`[source] watchCalls:`, watchCalls.map(w => w.provider));

  if (watchCalls.length === 0) return [];

  const watchResults = await Promise.allSettled(
    watchCalls.map(({ provider, episodeId }) =>
      fetch(
        `${baseUrl}/watch?provider=${encodeURIComponent(provider)}&episodeId=${encodeURIComponent(episodeId)}`,
        { signal: AbortSignal.timeout(15000) }
      )
        .then(r => r.ok ? r.json() : null)
        .then(data => ({ provider, data }))
    )
  );

  for (const result of watchResults) {
    if (result.status === "rejected") console.log(`[source] watch FAILED:`, result.reason?.message ?? result.reason);
    if (result.status === "fulfilled" && result.value?.data) console.log(`[source] watch OK:`, result.value.provider, `sub:`, !!result.value.data.sub, `dub:`, !!result.value.data.dub);
  }

  const allStreams: NormalizedStream[] = [];

  for (const result of watchResults) {
    if (result.status !== "fulfilled" || !result.value?.data) continue;
    const { provider, data } = result.value;
    const providerKey = provider.toLowerCase();

    for (const type of ["sub", "dub"] as const) {
      // RECONSUMET-TS now returns an ARRAY of results per type (one per real server the
      // provider offers), or null. Providers not yet updated send a single-element array
      // (the aggregator's fallback), so this loop handles both without special-casing.
      const serverResults = data[type] as ScraperResult[] | null;
      if (!Array.isArray(serverResults)) continue;

      for (const watchResult of serverResults) {
        if (!watchResult?.sources?.length) continue;

        const subtitles = (watchResult.subtitles ?? []).map((sub) => ({
          url: sub.url,
          language: sub.lang,
          label: sub.lang,
          default: false,
        }));

        for (const source of watchResult.sources) {
          allStreams.push({
            provider: providerKey,
            type,
            serverName: (watchResult.serverName ?? "").trim(),
            url: source.url,
            quality: source.quality,
            isM3U8: source.isM3U8,
            cookies: "",
            referer: watchResult.headers?.Referer ?? "",
            subtitles,
          });
        }
      }
    }
  }

  return allStreams;
}

interface ScraperResult {
  serverName?: string;
  sources: { url: string; quality: string; isM3U8: boolean }[];
  subtitles: { url: string; lang: string }[];
  headers: { Referer?: string };
}
