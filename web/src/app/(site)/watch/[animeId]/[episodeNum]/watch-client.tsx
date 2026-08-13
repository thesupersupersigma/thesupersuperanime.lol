"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { AnilistMedia } from "@/lib/anilist";
import { getDisplayTitle } from "@/lib/anilist";
import { AnimePlayer, ServerData } from "@/components/player/anime-player";
import { EpisodeSidebar } from "@/components/watch/episode-sidebar";
import { WatchInfo } from "@/components/watch/watch-info";
import { Comments } from "@/components/comments";
import { PromoBanner } from "@/components/PromoBanner";

export default function WatchClient() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const animeId = Number(params.animeId);
  const episodeNum = Number(params.episodeNum);
  const partyParam = searchParams.get("party");

  const [anime, setAnime] = useState<AnilistMedia | null>(null);
  const [servers, setServers] = useState<ServerData[]>([]);
  const [mirrorUsed, setMirrorUsed] = useState<number | undefined>(undefined);
  const [fallbackReason, setFallbackReason] = useState<string | undefined>(undefined);
  // Saved resume position (seconds) for THIS episode. Fetched here — not inside
  // the player — so it is known at mount, which is required for the hls.js
  // `startPosition` resume mechanism to take effect on the first manifest load.
  const [resumeTime, setResumeTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();

  // ── WATCH PARTY ─────────────────────────────────────────────────────────
  const [watchPartyCode, setWatchPartyCode] = useState<string | null>(null);
  const [isWatchPartyHost, setIsWatchPartyHost] = useState(false);
  const [watchPartyError, setWatchPartyError] = useState<string | null>(null);
  const [watchPartyCopied, setWatchPartyCopied] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");

  // Fetch the current user ID for the comments component
  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.userId) setCurrentUserId(d.userId) })
      .catch(() => {});
  }, []);

  // If the URL has ?party=ROOMCODE, join that room. Determine host vs guest by
  // comparing the current user against the room's hostId.
  useEffect(() => {
    if (!partyParam) return;
    let cancelled = false;
    fetch(`/api/watch-party/${partyParam}`)
      .then(r => (r.ok ? r.json() : null))
      .then(room => {
        if (cancelled) return;
        if (!room) {
          setWatchPartyError("Watch party room not found or expired.");
          setWatchPartyCode(null);
          return;
        }
        setWatchPartyError(null);
        setWatchPartyCode(room.roomCode);
        setIsWatchPartyHost(!!currentUserId && currentUserId === room.hostId);
      })
      .catch(() => {
        if (!cancelled) setWatchPartyError("Watch party room not found or expired.");
      });
    return () => { cancelled = true; };
  }, [partyParam, currentUserId]);

  // Create a new watch party room (host).
  async function startWatchParty() {
    try {
      const res = await fetch("/api/watch-party", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId, episodeNum }),
      });
      if (!res.ok) {
        setWatchPartyError("Could not start watch party. Please try again.");
        return;
      }
      const data = await res.json();
      setWatchPartyError(null);
      setWatchPartyCode(data.roomCode);
      setIsWatchPartyHost(true);
      const joinUrl = `https://www.thesupersuperanime.lol/watch/${animeId}/${episodeNum}?party=${data.roomCode}`;
      try {
        await navigator.clipboard.writeText(joinUrl);
        setWatchPartyCopied(true);
        setTimeout(() => setWatchPartyCopied(false), 3000);
      } catch { /* clipboard blocked — link still shown in the overlay */ }
    } catch {
      setWatchPartyError("Could not start watch party. Please try again.");
    }
  }

  // Timestamp of the last dead-token source refetch — guards against a
  // persistently dead source hammering /api/source in a loop.
  const lastRefetchRef = useRef(0);

  // Re-fetch sources after a fatal playback error (expired/dead proxy token).
  // Passed to AnimePlayer as onSourceFailure; a fresh /api/source response
  // mints new tokens and the player picks up the new srcUrl.
  const refetchSources = useCallback(async () => {
    if (!anime) return;
    const now = Date.now();
    if (now - lastRefetchRef.current < 5000) {
      setError("Stream unavailable — try another server");
      return;
    }
    lastRefetchRef.current = now;
    try {
      const sourceRes = await fetch("/api/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          animeId,
          episodeNum,
          animeTitle: getDisplayTitle(anime.title),
        }),
      });
      if (!sourceRes.ok) {
        // The hardcoded message used to be thrown for ANY status, so a 429 or a
        // 500 was displayed and logged as "No playable streams found" — the most
        // misleading possible attribution, pointing debugging at the scraper.
        const body = await sourceRes.text().catch(() => "");
        console.error("[watch] source fetch failed", {
          animeId, episodeNum, status: sourceRes.status, body: body.slice(0, 500),
        });
        throw new Error(`Stream request failed (HTTP ${sourceRes.status})`);
      }
      const sourceData = await sourceRes.json();
      if (sourceData.servers && sourceData.servers.length > 0) {
        setServers(sourceData.servers);
        setMirrorUsed(sourceData.mirrorUsed);
        setFallbackReason(sourceData.fallbackReason);
      } else {
        throw new Error("No servers available for this episode.");
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [anime, animeId, episodeNum]);

  // Join an existing room by code — navigate to ?party=ROOMCODE.
  function joinByCode() {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) return;
    router.push(`/watch/${animeId}/${episodeNum}?party=${code}`);
  }

  useEffect(() => {
    if (isNaN(animeId) || isNaN(episodeNum)) {
      router.push("/");
      return;
    }

    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch Anime Info from AniList
        const infoRes = await fetch(`/api/anilist/${animeId}`);
        if (!infoRes.ok) throw new Error("Failed to fetch anime info");
        const data = await infoRes.json();

        if (!data.anime) throw new Error("Anime not found");
        if (!cancelled) {
          setAnime(data.anime);
        }

        const animeTitle = getDisplayTitle(data.anime.title);

        // Kick off the saved-progress fetch in PARALLEL with the source request
        // so the resume position is ready before the player mounts. A failure
        // here must never block playback — it resolves to 0 (start from the top).
        const progressPromise: Promise<number> = fetch(`/api/progress?episodeId=${animeId}-${episodeNum}`)
          .then(r => (r.ok ? r.json() : null))
          .then(d => {
            const rec = d?.history?.find(
              (h: { episodeId: string; progress: number }) => h.episodeId === `${animeId}-${episodeNum}`,
            );
            // Only resume if the saved position is meaningfully into the video (>10 s).
            return rec && rec.progress > 10 ? rec.progress : 0;
          })
          .catch(() => 0);

        // 2. Fetch the Servers from our new Dual-API Aggregator
        const sourceRes = await fetch("/api/source", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            animeId,
            episodeNum,
            animeTitle,
          }),
        });

        if (!sourceRes.ok) {
          const body = await sourceRes.text().catch(() => "");
          console.error("[watch] source fetch failed", {
            animeId, episodeNum, status: sourceRes.status, body: body.slice(0, 500),
          });
          throw new Error(`Stream request failed (HTTP ${sourceRes.status})`);
        }

        const sourceData = await sourceRes.json();

        if (sourceData.servers && sourceData.servers.length > 0) {
          // Resolve the resume position before flipping `loading` off so the
          // player mounts with it already in hand.
          const resume = await progressPromise;
          console.log('[resume] watch page resolved resumeTime', resume);
          if (!cancelled) {
            setResumeTime(resume);
            setServers(sourceData.servers);
            setMirrorUsed(sourceData.mirrorUsed);
            setFallbackReason(sourceData.fallbackReason);
          }
        } else {
          throw new Error("No servers available for this episode.");
        }

      } catch (err) {
        console.error(err);
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [animeId, episodeNum, router]);

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto md:px-4 pt-0 md:pt-4 pb-12">
        <style>{`
          @keyframes playerPulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }
        `}</style>
        <div className="flex flex-col md:flex-row gap-6">
          {/* Main player area */}
          <div className="flex-1 min-w-0 flex flex-col" style={{ gap: "12px" }}>
            {/* Video rectangle */}
            <div style={{
              width: "100%", aspectRatio: "16/9",
              background: "#111", border: "1px solid #2a2a2a",
              borderRadius: "8px",
              animation: "playerPulse 2s ease-in-out infinite",
            }} />
            {/* Server selector skeleton */}
            <div style={{ display: "flex", gap: "8px" }}>
              {[72, 64, 60].map((w, i) => (
                <div key={i} style={{
                  width: w, height: 30,
                  background: "#1a1a1a", border: "1px solid #2a2a2a",
                  borderRadius: "6px",
                  animation: "playerPulse 2s ease-in-out infinite",
                  animationDelay: `${i * 120}ms`,
                }} />
              ))}
            </div>
            {/* Title / episode info skeleton */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "8px" }}>
              <div style={{ height: 18, width: "55%", background: "#1a1a1a", borderRadius: "4px", animation: "playerPulse 2s ease-in-out infinite" }} />
              <div style={{ height: 13, width: "30%", background: "#1a1a1a", borderRadius: "4px", animation: "playerPulse 2s ease-in-out infinite", animationDelay: "80ms" }} />
            </div>
          </div>
          {/* Sidebar skeleton (desktop only) */}
          <div className="hidden md:block" style={{ width: 320, flexShrink: 0 }}>
            <div style={{
              background: "#1a1a1a", border: "1px solid #2a2a2a",
              borderRadius: "8px", height: "70vh",
              animation: "playerPulse 2s ease-in-out infinite",
            }} />
          </div>
        </div>
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a] text-white">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || "Something went wrong"}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-blue-600 px-4 py-2 rounded font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const title = getDisplayTitle(anime.title);

  return (
    <div className="max-w-[1400px] mx-auto md:px-4 pt-0 md:pt-4 pb-12">
      <div className="flex flex-col md:flex-row gap-6" style={{ alignItems: "flex-start" }}>

        {/* Main Player Area */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="w-full bg-black md:rounded-lg shadow-xl" style={{ border: "1px solid #2a2a2a" }}>
            <AnimePlayer
              servers={servers}
              animeId={animeId}
              episodeNum={episodeNum}
              animeTitle={title}
              mirrorUsed={mirrorUsed}
              fallbackReason={fallbackReason}
              resumeTime={resumeTime}
              onSourceFailure={refetchSources}
              totalEpisodes={
                anime.nextAiringEpisode?.episode
                  ? anime.nextAiringEpisode.episode - 1
                  : anime.episodes ?? undefined
              }
              nextAiringEpisode={anime.nextAiringEpisode ?? undefined}
              malId={anime.idMal ?? undefined}
              watchPartyCode={watchPartyCode ?? undefined}
              isWatchPartyHost={isWatchPartyHost}
            />
          </div>

          {/* ── WATCH PARTY CONTROLS ── */}
          {(currentUserId && !watchPartyCode) || watchPartyCopied || watchPartyError ? (
            <div className="mt-4 mb-2 px-4 md:px-0" style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              {currentUserId && !watchPartyCode && (
                <button
                  onClick={startWatchParty}
                  style={{
                    border: "1px solid #2a2a2a",
                    background: "transparent",
                    color: "#a3a3a3",
                    fontSize: "12px",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  🎬 Start Watch Party
                </button>
              )}
              {currentUserId && !watchPartyCode && (
                <form
                  onSubmit={(e) => { e.preventDefault(); joinByCode(); }}
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <input
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="Room code e.g. AB12CD"
                    maxLength={6}
                    style={{
                      width: "160px",
                      border: "1px solid #2a2a2a",
                      background: "transparent",
                      color: "#e5e5e5",
                      fontSize: "12px",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontFamily: "inherit",
                      textTransform: "uppercase",
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      border: "1px solid #2a2a2a",
                      background: "transparent",
                      color: "#a3a3a3",
                      fontSize: "12px",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Join
                  </button>
                </form>
              )}
              {watchPartyCopied && (
                <span style={{ color: "#22c55e", fontSize: "12px" }}>
                  Link copied! Share it with friends.
                </span>
              )}
              {watchPartyError && (
                <span style={{ color: "#ef4444", fontSize: "12px" }}>{watchPartyError}</span>
              )}
            </div>
          ) : null}

          <div className="hidden md:block mt-6">
            <PromoBanner />
          </div>

          <div className="hidden md:block mt-6">
            <WatchInfo anime={anime} episodeNum={episodeNum} />
          </div>

          {/* Comments — desktop */}
          <div className="hidden md:block mt-6">
            <Comments animeId={animeId} episodeId={`${animeId}-${episodeNum}`} currentUserId={currentUserId} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full md:w-[320px] lg:w-[380px] flex-shrink-0">
          <div className="bg-[#1a1a1a] md:border border-[#2a2a2a] md:rounded-lg overflow-hidden" style={{ alignSelf: "flex-start", position: "sticky", top: "80px", height: "calc((100vw - 380px - 2rem - 1.5rem) * 9 / 16 + 56px)", display: "flex", flexDirection: "column" }}>
            <div className="p-4 border-b border-[#2a2a2a] hidden md:block flex-shrink-0">
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "16px", fontWeight: 600, color: "#e5e5e5" }}>
                Episodes
              </h2>
            </div>
            <div className="overflow-y-auto" style={{ scrollbarWidth: "thin", overflowY: "auto", height: "100%" }}>
              <EpisodeSidebar
                totalEpisodes={anime.episodes}
                nextAiringEpisode={anime.nextAiringEpisode?.episode}
                currentEpisode={episodeNum}
                animeId={animeId}
                coverImage={anime.coverImage.medium}
              />
            </div>
          </div>
        </div>

        {/* Mobile Info (shows below sidebar on mobile) */}
        <div className="md:hidden mt-4">
          <WatchInfo anime={anime} episodeNum={episodeNum} />
        </div>

        {/* Comments — mobile */}
        <div className="md:hidden mt-4">
          <Comments animeId={animeId} currentUserId={currentUserId} />
        </div>
      </div>
    </div>
  );
}