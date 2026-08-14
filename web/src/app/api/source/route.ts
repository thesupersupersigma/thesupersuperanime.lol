import { NextRequest, NextResponse } from "next/server";
import { createHmac, createCipheriv, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import {
  buildProviderQueue,
  buildWatchCalls,
  pendingProviders,
  providerKey,
  verifyEpisodeResponse,
  type EpisodeRef,
  type EpisodesResponse,
  type InfoResponse,
} from "./provider-pairing";
import { errorInfo, errorStack } from "@/lib/log-error";
import { requireAuth } from "@/lib/auth";

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

    // Resolve the session once: it's both the auth check and the rate-limit key.
    // Returns null immediately when there's no cookie, so anonymous requests
    // don't pay for a DB round-trip.
    const user = await requireAuth();

    // In-route auth. The middleware gates this path, but it could only check
    // that a `user-session` cookie existed — this is the DB-backed check that
    // actually resolves it, so a forged or expired cookie can't mint tokens.
    // Mirrors the proxy's own policy: when MASTER_GATE or DISCORD_GATE is off,
    // anonymous playback is intentionally allowed and this check is skipped.
    if (process.env.DISCORD_GATE !== "off" && process.env.MASTER_GATE !== "off") {
      if (!user) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
    }

    // NOT `?? site-auth`: that fallback wrote the raw SITE_PASSWORD into
    // SourceToken.sessionId (a plain text column) for up to 3h per row, so a DB
    // dump, a Prisma query log or the Neon console disclosed the gate password.
    // src/proxy.ts now mints `session-id` on every request, so this resolves to
    // a real per-browser id rather than falling through to "anonymous".
    const sessionId = req.cookies.get("session-id")?.value ?? "anonymous";
    const ip = getClientIp(req);

    // Key on something the client cannot rotate. The old key was
    // `session-id ?? site-auth ?? "anonymous"`:
    //   - `session-id` is client-supplied and unsigned, so rotating it per
    //     request gave a fresh bucket every time and the cap never fired;
    //   - `site-auth` is the raw SITE_PASSWORD, identical for every visitor;
    //   - `"anonymous"` is the *normal* first-visit case (the watch page fires
    //     /api/progress and /api/source in the same tick, so the Set-Cookie
    //     can't land first), which put every new visitor in ONE shared bucket
    //     and 429'd the 11th of them.
    // A verified user id can't be rotated without registering another account;
    // otherwise fall back to the reverse-proxy-supplied IP.
    const rateLimitKey = user ? `source:user:${user.id}` : `source:ip:${ip}`;
    if (!checkRateLimit(rateLimitKey, 10, 60_000)) {
      console.warn("[/api/source] rate limited", { key: rateLimitKey, animeId, episodeNum });
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }

    console.log(`[/api/source] Fetching streams for animeId: ${id} | Ep: ${ep}`);

    let allStreams: NormalizedStream[] = [];
    let fallbackReason = "primary";
    try {
      allStreams = await fetchScraper(id, ep);
      if (allStreams.length === 0) fallbackReason = "not_found";
    } catch (err) {
      const { errName, errMessage } = errorInfo(err);
      fallbackReason = errName === "TimeoutError" || errName === "AbortError" ? "timeout" : "error";
      // This catch used to read err.name and drop everything else, so a thrown
      // config error, a 15s timeout and an empty provider list were identical
      // in the logs — which is exactly why the last outage couldn't be traced.
      console.error("[/api/source] fetchScraper threw", {
        animeId: id,
        episodeNum: ep,
        fallbackReason,
        errName,
        errMessage,
        stack: errorStack(err),
      });
    }

    if (allStreams.length === 0) {
      // fallbackReason distinguishes timeout / upstream error / genuinely no
      // sources. The success path already returns it; the 404 used to drop it,
      // leaving the client with one undiagnosable message for all three.
      console.error("[/api/source] 404 no streams", { animeId: id, episodeNum: ep, fallbackReason });
      return NextResponse.json({ error: "No playable streams found", fallbackReason }, { status: 404 });
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

interface ScraperCallContext {
  animeId: number;
  episodeNum: number;
  endpoint: string;
  provider?: string;
}

/**
 * GET + parse JSON from the scraper, logging the HTTP status on a non-2xx.
 *
 * The old inline `r.ok ? r.json() : null` collapsed a 502, a 429 and an empty
 * body into the same `null`, so the breadcrumbs downstream reported "no
 * providers" when the truth was "upstream returned 502". Rejections are left to
 * propagate so the caller's allSettled can log `.reason`.
 */
async function fetchScraperJson<T>(
  url: string,
  timeoutMs: number,
  ctx: ScraperCallContext,
): Promise<T | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    console.error("[source] upstream non-OK", { ...ctx, status: res.status, statusText: res.statusText });
    return null;
  }
  return (await res.json()) as T;
}

/** Unwrap an allSettled result, logging the rejection reason instead of discarding it. */
function settledValue<T>(result: PromiseSettledResult<T | null>, ctx: ScraperCallContext): T | null {
  if (result.status === "fulfilled") return result.value;
  console.error("[source] upstream fetch rejected", { ...ctx, ...errorInfo(result.reason) });
  return null;
}

async function fetchScraper(
  animeId: number,
  episodeNum: number
): Promise<NormalizedStream[]> {
  const baseUrl = process.env.SCRAPER_API_URL;
  if (!baseUrl) {
    // Without this line a missing env var is indistinguishable from "this
    // episode has no sources" — the throw is caught upstream and rendered as a
    // 404. A config error must never masquerade as absent content.
    console.error("[/api/source] SCRAPER_API_URL is not set", { animeId, episodeNum });
    throw new Error("SCRAPER_API_URL is not set");
  }

  const logCtx = { animeId, episodeNum };

  // Fire /info (provider list) and primary /episodes (best provider) concurrently.
  const [infoRes, primaryEpsRes] = await Promise.allSettled([
    fetchScraperJson<InfoResponse>(`${baseUrl}/info/${animeId}`, 15000, { ...logCtx, endpoint: "/info" }),
    fetchScraperJson<EpisodesResponse>(`${baseUrl}/episodes/${animeId}`, 30000, { ...logCtx, endpoint: "/episodes" }),
  ]);

  const info = settledValue(infoRes, { ...logCtx, endpoint: "/info" });
  const primaryEps = settledValue(primaryEpsRes, { ...logCtx, endpoint: "/episodes" });

  console.log(`[source] /info result:`, JSON.stringify(info?.mappings?.map(m => m.provider)));
  console.log(`[source] primary /episodes provider:`, primaryEps?.provider, `episodes:`, primaryEps?.episodes?.length ?? 0);

  // The queue head is only usable when the primary call names a provider. When
  // it fails, times out, or answers `provider: null`, the top-ranked /info
  // mapping leads instead — previously it was then silently dropped (see 2b).
  if (!primaryEps?.provider || !primaryEps.episodes?.length) {
    console.warn("[api/source] primary /episodes empty", {
      ...logCtx,
      queueHead: info?.mappings?.[0]?.provider ?? null,
      reason:
        primaryEpsRes.status === "rejected"
          ? "rejected"
          : primaryEps === null
            ? "non-2xx"
            : !primaryEps.provider
              ? "null-provider"
              : "no-episodes",
    });
  }

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
        fetchScraperJson<EpisodesResponse>(
          `${baseUrl}/episodes/${animeId}?provider=${encodeURIComponent(provider)}`,
          20000,
          { ...logCtx, endpoint: "/episodes", provider },
        ).then(data => ({ provider, data }))
      )
    );
    for (let i = 0; i < epsResults.length; i++) {
      const result = epsResults[i];
      if (result.status !== "fulfilled") {
        console.error("[source] upstream fetch rejected", {
          ...logCtx,
          endpoint: "/episodes",
          provider: secondaryProviders[i],
          ...errorInfo(result.reason),
        });
        continue;
      }
      const { provider, data } = result.value;

      // Trust the provider the API says answered, never the one we asked for.
      // An aggregator fallback body filed under the requested name is what
      // produced AniNeko-shaped ids on ReAnime /watch calls -> intermittent 400s.
      const verdict = verifyEpisodeResponse(provider, data);
      if (!verdict.accepted) {
        if (verdict.reason === "mismatch") {
          console.warn("[api/source] provider mismatch", {
            ...logCtx,
            requested: provider,
            answered: verdict.answered,
          });
        }
        continue;
      }

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
      fetchScraperJson<WatchResponse>(
        `${baseUrl}/watch?provider=${encodeURIComponent(provider)}&episodeId=${encodeURIComponent(episodeId)}`,
        15000,
        { ...logCtx, endpoint: "/watch", provider },
      ).then(data => ({ provider, data }))
    )
  );

  for (let i = 0; i < watchResults.length; i++) {
    const result = watchResults[i];
    if (result.status === "rejected") {
      // Was console.log — a provider dropping out of the dropdown is a failure,
      // and at info level it never showed up in a log search.
      console.error("[source] upstream fetch rejected", {
        ...logCtx,
        endpoint: "/watch",
        provider: watchCalls[i].provider,
        episodeId: watchCalls[i].episodeId,
        ...errorInfo(result.reason),
      });
      continue;
    }
    if (result.value?.data) {
      console.log(`[source] watch OK:`, result.value.provider, `sub:`, !!result.value.data.sub, `dub:`, !!result.value.data.dub);
    }
  }

  const allStreams: NormalizedStream[] = [];

  for (const result of watchResults) {
    if (result.status !== "fulfilled" || !result.value?.data) continue;
    const { provider, data } = result.value;
    // Local name, not the imported providerKey() helper — kept distinct so the
    // two can't be confused at a glance.
    const providerLower = providerKey(provider);

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
            provider: providerLower,
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

/** GET /watch — one entry per audio type, each an array of per-server results. */
interface WatchResponse {
  sub?: ScraperResult[] | null;
  dub?: ScraperResult[] | null;
}
