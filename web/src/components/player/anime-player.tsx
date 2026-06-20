"use client";

import { useState, useRef, useEffect, useCallback, startTransition } from "react";
import { MediaPlayer, MediaProvider, MediaPlayerInstance, useMediaState, Track } from "@vidstack/react";
import { defaultLayoutIcons, DefaultVideoLayout } from "@vidstack/react/player/layouts/default";
import { isHLSProvider } from "vidstack";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import { useRouter } from "next/navigation";
import { WatchPartySync } from "@/components/player/watch-party-sync";

function secondsUntil(airingAt: number): number {
  return Math.max(0, airingAt - Date.now() / 1000);
}

export interface ServerData {
  name: string;
  type: "sub" | "dub";
  sources: { token: string; quality: string; isM3U8: boolean }[];
  subtitles?: { url: string; language: string; label: string; default: boolean }[];
}

interface AnimePlayerProps {
  servers: ServerData[];
  animeId: number;
  episodeNum: number;
  animeTitle: string;
  mirrorUsed?: number;
  fallbackReason?: string;
  // Saved resume position in seconds (0 = start from the beginning). Resolved by
  // the parent BEFORE mount so hls.js can begin buffering at this offset on its
  // very first manifest load — see onProviderChange below.
  resumeTime?: number;
  // Called when playback fails fatally (commonly dead/expired proxy tokens) so
  // the parent can re-fetch fresh sources. SourceLoader guards against loops.
  onSourceFailure?: () => void;
  totalEpisodes?: number;
  nextAiringEpisode?: { episode: number; airingAt: number };
  animeSlug?: string;
  malId?: number;
  // Watch party: when set, the player is part of a synced room. The host pushes
  // its position; guests follow it (see WatchPartySync).
  watchPartyCode?: string;
  isWatchPartyHost?: boolean;
}

export function AnimePlayer({
  servers, animeId, episodeNum, animeTitle, mirrorUsed, fallbackReason, resumeTime = 0, onSourceFailure, totalEpisodes = Infinity, nextAiringEpisode, animeSlug, malId, watchPartyCode, isWatchPartyHost,
}: AnimePlayerProps) {
  const router = useRouter();
  const playerRef = useRef<MediaPlayerInstance>(null);

  // --- STATE ---
  const [audioType, setAudioType]             = useState<"sub" | "dub">("sub");
  const [selectedServerName, setSelectedServerName] = useState<string>("");
  const [showNextPrompt, setShowNextPrompt]   = useState(false);
  const [playerError, setPlayerError]         = useState<string | null>(null);
  const [currentTime, setCurrentTime]         = useState(0);
  const [duration, setDuration]               = useState(0);
  // True when the server hasn't produced any playable output within 14 s.
  const [showServerTimeout, setShowServerTimeout] = useState(false);
  const controlsVisible = useMediaState('controlsVisible', playerRef);

  interface SkipInterval { startTime: number; endTime: number; }
  const [skipIntro, setSkipIntro] = useState<SkipInterval | null>(null);
  const [skipOutro, setSkipOutro] = useState<SkipInterval | null>(null);
  const skipFetchedRef = useRef<string>("");

  // --- REFS ---
  const lastSavedTimeRef      = useRef<number>(0);
  const durationRef           = useRef<number>(0);          // avoids stale closure in onTimeUpdate
  const autoNextTimeoutRef    = useRef<NodeJS.Timeout | null>(null);
  const serverTimeoutTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Unified "where should the next source load start" (seconds). Initialised to
  // the saved resume position at mount (the player remounts per episode, so this
  // captures each episode's value), and overwritten with the live currentTime
  // when the user switches server/audio/quality. Applied via startPosition for
  // hls.js (no seek) and via currentTime for native engines.
  const startPositionRef    = useRef<number>(resumeTime);
  // True while an in-place server/audio/quality switch is settling, so onCanPlay
  // knows to resume playback (native load() pauses the element).
  const pendingSwitchRef    = useRef<boolean>(false);
  // Skip the first src-change effect run (the initial mount is positioned by
  // onProviderChange); only later switches hit the persistent-instance path.
  const firstSrcRef         = useRef<boolean>(true);

  // Soft-stall watchdog timer.
  const stallTimerRef       = useRef<NodeJS.Timeout | null>(null);

  const hasDub         = servers.some(s => s.type === "dub");
  const visibleServers = servers.filter(s => s.type === audioType);

  // ── PREFERENCES ───────────────────────────────────────────────────────────

  useEffect(() => {
    const savedAudio  = localStorage.getItem("preferred-audio") as "sub" | "dub" | null;
    const savedServer = localStorage.getItem("preferred-server");

    const subServers = servers.filter(s => s.type === "sub");
    const dubServers = servers.filter(s => s.type === "dub");
    const targetType: "sub" | "dub" =
      savedAudio === "dub" && dubServers.length > 0 ? "dub" :
      subServers.length > 0 ? "sub" :
      dubServers.length > 0 ? "dub" : "sub";

    const available = servers.filter(s => s.type === targetType);

    startTransition(() => {
      setAudioType(targetType);
      if (savedServer && available.find(s => s.name === savedServer)) {
        setSelectedServerName(savedServer);
      } else if (available.length > 0) {
        setSelectedServerName(available[0].name);
      }
    });
  }, [servers]);

  // Identify the active server within the visible set
  const activeServer    = visibleServers.find(s => s.name === selectedServerName) || visibleServers[0];

  // ── SERVER TIMEOUT ─────────────────────────────────────────────────────────
  // Arms a 14 s timer every time the selected server changes (including the
  // initial load). The timer is cancelled in onCanPlay / onPlaying — both are
  // reliable signals that the server is alive. If neither fires within 14 s the
  // overlay is shown so the user can manually switch to another server.
  useEffect(() => {
    if (!selectedServerName) return;
    startTransition(() => { setShowServerTimeout(false); });
    if (serverTimeoutTimerRef.current) clearTimeout(serverTimeoutTimerRef.current);
    serverTimeoutTimerRef.current = setTimeout(() => setShowServerTimeout(true), 14000);
    return () => {
      if (serverTimeoutTimerRef.current) clearTimeout(serverTimeoutTimerRef.current);
    };
  }, [selectedServerName]);

  const activeSource = activeServer?.sources[0];
  const srcUrl       = activeSource ? `/api/proxy/${activeSource.token}` : "";

  // ── SERVER / AUDIO / QUALITY HANDLERS ─────────────────────────────────────

  // Stash the live position as the next source's start position and flag the
  // switch so playback resumes once the new stream is ready.
  const stashSwitchPosition = () => {
    const player = playerRef.current;
    if (player) {
      startPositionRef.current = player.currentTime;
      pendingSwitchRef.current = true;
    }
  };

  const handleServerChange = (newServerName: string) => {
    if (newServerName === selectedServerName) return;
    stashSwitchPosition();
    setSelectedServerName(newServerName);
    localStorage.setItem("preferred-server", newServerName);
    setPlayerError(null);
  };

  const handleAudioTypeChange = (newType: "sub" | "dub") => {
    if (newType === audioType) return;
    stashSwitchPosition();
    setAudioType(newType);
    setPlayerError(null);
    localStorage.setItem("preferred-audio", newType);
    const available = servers.filter(s => s.type === newType);
    if (available.length > 0 && !available.find(s => s.name === selectedServerName)) {
      setSelectedServerName(available[0].name);
    }
  };

  // ── WATCH PARTY AUDIO SYNC ──────────────────────────────────────────────────
  // WatchPartySync (a child) can't switch audio directly — audio type lives
  // here. It dispatches a `watch-party-audio-sync` event when the host's sub/dub
  // selection differs; we mirror it via handleAudioTypeChange (a no-op if same).
  // Routed through a ref so the listener always sees the latest handler.
  const handleAudioTypeChangeRef = useRef(handleAudioTypeChange);
  useEffect(() => { handleAudioTypeChangeRef.current = handleAudioTypeChange; });
  useEffect(() => {
    const onAudioSync = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.audioType === "sub" || detail?.audioType === "dub") {
        handleAudioTypeChangeRef.current(detail.audioType);
      }
    };
    window.addEventListener("watch-party-audio-sync", onAudioSync);
    return () => window.removeEventListener("watch-party-audio-sync", onAudioSync);
  }, []);

  // ── RESUME-ON-SWITCH (persistent hls.js instance) ──────────────────────────
  // A server/audio/quality change swaps the source on the SAME hls.js instance:
  // Vidstack only fires onProviderChange on a provider *type* change, not a
  // same-type src swap, so the initial-resume hook below doesn't run. Feed the
  // stashed position in as the live instance's startPosition instead, so the
  // reloaded manifest buffers there from its first fragment — the exact no-seek
  // mechanism the initial resume uses. (Native engines reset currentTime to 0 on
  // load() and are handled in onCanPlay; the first run is skipped because the
  // initial source is positioned by onProviderChange.)
  useEffect(() => {
    if (firstSrcRef.current) { firstSrcRef.current = false; return; }
    const provider = playerRef.current?.provider;
    if (isHLSProvider(provider) && provider.instance) {
      const start = startPositionRef.current;
      // Intentional: mutates the persistent hls.js instance's startPosition in place so a
      // same-type src swap resumes without a seek.
      // eslint-disable-next-line react-hooks/immutability
      provider.instance.config.startPosition = start > 0 ? start : 0;
      console.log('[resume] src changed — persistent hls.js startPosition =', start);
    }
  }, [srcUrl]);

  // ── PROGRESS LOGIC ─────────────────────────────────────────────────────────

  const saveProgress = useCallback(async (ct: number, dur: number) => {
    if (ct < 1 || dur < 1) return;
    if (Math.abs(ct - lastSavedTimeRef.current) < 10 && ct !== dur) return;
    lastSavedTimeRef.current = ct;
    try {
      await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          animeId:   Number(animeId),
          episodeId: `${animeId}-${episodeNum}`,
          progress:  Math.floor(ct),
          duration:  Math.floor(dur),
        }),
      });
    } catch {}
  }, [animeId, episodeNum]);

  const onCanPlay = () => {
    const player = playerRef.current;
    if (!player) return;
    // Server responded with a valid stream — dismiss the timeout overlay.
    if (serverTimeoutTimerRef.current) clearTimeout(serverTimeoutTimerRef.current);
    setShowServerTimeout(false);

    const isNative = !isHLSProvider(player.provider);

    // Native HLS (Safari/iOS) and MP4 reset currentTime to 0 on every (re)load
    // and handle arbitrary-position range requests reliably, so they resume by
    // seeking here. hls.js engines are positioned via startPosition
    // (onProviderChange + the src-change effect) and must NOT be seeked here —
    // that is the original freeze. This branch also restores position across
    // native server/quality switches (load() zeroed currentTime above).
    if (isNative) {
      const start = startPositionRef.current;
      if (start > 0) {
        const dur = player.duration || 0;
        const target = dur > 0 ? Math.min(start, dur - 5) : start;
        player.currentTime = target;
        console.log('[resume] onCanPlay native seek →', target, '(raw', start + ')');
      }
      startPositionRef.current = 0; // consume so a later canPlay can't re-seek
    }

    // Resume playback after an in-place server/audio/quality switch so the swap
    // is seamless. Native load() pauses the element; hls.js keeps playing, where
    // play() is a harmless no-op.
    if (pendingSwitchRef.current) {
      pendingSwitchRef.current = false;
      setTimeout(async () => {
        try { await player.play(); } catch { /* browser blocked auto-play */ }
      }, isNative ? 150 : 0);
    }
  };

  // ── STALL & FAILURE RECOVERY ─────────────────────────────────────────────
  // Three independent layers, in order of how often they fire:
  //
  //   1. onProviderChange tunes hls.js (buffer-hole tolerance) AND starts
  //      buffering at the resume offset, so the player never strands itself on a
  //      gap or a play-from-0-then-seek to begin with.
  //
  //   2. onWaiting watchdog catches a stall that produces no error at all (e.g.
  //      a quietly hung segment fetch): after 6 s we re-kick the loader with
  //      startLoad() — no position argument, since passing one previously made
  //      the player jump to the end of the episode. It deliberately does NOTHING
  //      near the end or while paused, so a tail-end stall can't be "recovered"
  //      into an end-of-stream / false `ended`.
  //
  //   3. onPlaybackError handles a *fatal* failure. Vidstack already auto-runs
  //      recoverMediaError() for fatal media errors; what it can't fix is dead
  //      proxy tokens (expired or an upstream drop), which surface here as a
  //      fatal error. For those we ask the parent to re-fetch fresh sources.

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const onWaiting = useCallback(() => {
    clearStallTimer();
    stallTimerRef.current = setTimeout(() => {
      const player = playerRef.current;
      if (!player) return;
      // A "stall" at the very end is just the stream finishing, and a paused
      // player isn't stalled at all — re-kicking the loader in either case can
      // shove MSE into end-of-stream and fire a false `ended`. Leave them be.
      if (player.paused) return;
      const dur = player.duration || durationRef.current || 0;
      if (dur > 0 && player.currentTime >= dur - 2) return;
      const provider = player.provider;
      if (isHLSProvider(provider) && provider.instance) {
        provider.instance.startLoad();              // resume loading from current position
      } else {
        player.currentTime = player.currentTime + 0.1; // native HLS / MP4 nudge
      }
    }, 6000);
  }, [clearStallTimer]);

  const onPlaying = useCallback(() => {
    console.log('[resume] onPlaying — currentTime:', playerRef.current?.currentTime, 'duration:', durationRef.current);
    clearStallTimer();
    // Playback actually started — server is alive, no need for the timeout overlay.
    if (serverTimeoutTimerRef.current) clearTimeout(serverTimeoutTimerRef.current);
    setShowServerTimeout(false);
  }, [clearStallTimer]);

  // onProviderChange fires BEFORE the hls.js instance is created, so config set
  // here is spread into the constructor. This is the heart of the resume fix:
  // `startPosition` makes hls.js request the fragment AT the resume offset first
  // and buffer outward from there — no play-from-0-then-seek, so no buffer flush,
  // no refetch-through-the-proxy stall, no starvation, no false `ended`. The
  // buffer-hole tolerances stay for ordinary mid-stream stalls.
  const onProviderChange = (providerOrEvent: unknown) => {
    const arg = providerOrEvent as { detail?: unknown };
    // Vidstack React may pass the provider directly OR wrap it in a DOMEvent where .detail is the provider.
    // Handle both shapes so isHLSProvider actually sees the right object.
    const provider = isHLSProvider(providerOrEvent) ? providerOrEvent : isHLSProvider(arg?.detail) ? arg.detail : null;

    if (!provider) return;

    const start = startPositionRef.current;
    provider.config = {
      ...provider.config,
      ...(start > 0 ? { startPosition: start } : {}),
      maxBufferHole: 0.5,
      nudgeMaxRetry: 5,
    };
    console.log('[resume] onProviderChange — hls.js startPosition =', start > 0 ? start : '(default 0)');
  };

  // Fatal playback error — hls.js has exhausted all retries. Show the error UI
  // and let the user decide whether to retry or switch servers manually.
  const onPlaybackError = useCallback(() => {
    if (onSourceFailure) onSourceFailure();
    else setPlayerError("Stream unavailable — try another server");
  }, [onSourceFailure]);

  const onTimeUpdate = () => {
    const player = playerRef.current;
    if (!player) return;
    const t = player.currentTime || 0;
    const d = player.state?.duration || 0;

    setCurrentTime(t);

    // Track duration via a ref to avoid stale-closure mismatches, then sync to state
    if (d > 0 && Math.abs(d - durationRef.current) > 0.5) {
      durationRef.current = d;
      setDuration(d);
      fetchSkipTimes(d);
    }

    // NOTE: resume is no longer a deferred seek here. Playback STARTS at the
    // resume offset (hls.js startPosition / native currentTime-on-canplay), so
    // there is nothing to seek to once duration is known.

    saveProgress(t, d);
  };

  const onEnded = () => {
    const player = playerRef.current;
    if (!player) return;
    const dur = player.duration || durationRef.current || 0;
    const ct  = player.currentTime || 0;
    // Only auto-advance when GENUINELY at the end. A starved/false `ended` — MSE
    // driven to end-of-stream by a stall, or a 0-duration glitch during loading —
    // lands far from `dur` and must never trigger the next-episode prompt.
    if (!(dur > 0 && ct >= dur - 2)) {
      console.log('[resume] onEnded IGNORED (false ended) — currentTime', ct, 'duration', dur);
      return;
    }
    console.log('[resume] onEnded — advancing at', ct, 'of', dur);
    saveProgress(dur, dur);
    if (totalEpisodes && episodeNum >= totalEpisodes) {
      setShowNextPrompt(true);
      return;
    }
    setShowNextPrompt(true);
    autoNextTimeoutRef.current = setTimeout(
      () => router.push(`/watch/${animeId}/${episodeNum + 1}`),
      5000,
    );
  };

  useEffect(() => () => {
    if (autoNextTimeoutRef.current)    clearTimeout(autoNextTimeoutRef.current);
    if (stallTimerRef.current)         clearTimeout(stallTimerRef.current);
    if (serverTimeoutTimerRef.current) clearTimeout(serverTimeoutTimerRef.current);
  }, []);

  // ── ANISKIP ────────────────────────────────────────────────────────────────

  const fetchSkipTimes = useCallback(async (durationSecs: number) => {
    if (!malId || !episodeNum || durationSecs < 1) return;
    const key = `${malId}-${episodeNum}`;
    if (skipFetchedRef.current === key) return;
    skipFetchedRef.current = key;
    try {
      const res = await fetch(
        `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNum}?types[]=op&types[]=ed&episodeLength=${durationSecs.toFixed(3)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!data.found) return;
      for (const result of data.results) {
        if (result.skipType === "op" || result.skipType === "mixed-op") {
          setSkipIntro({ startTime: result.interval.startTime, endTime: result.interval.endTime });
        }
        if (result.skipType === "ed" || result.skipType === "mixed-ed") {
          setSkipOutro({ startTime: result.interval.startTime, endTime: result.interval.endTime });
        }
      }
    } catch {
      // AniSkip unavailable, skip silently
    }
  }, [malId, episodeNum]);

  useEffect(() => {
    startTransition(() => {
      setSkipIntro(null);
      setSkipOutro(null);
    });
    skipFetchedRef.current = "";
  }, [episodeNum]);

  const activeSkip: { label: string; endTime: number } | null = (() => {
    if (skipIntro && currentTime >= skipIntro.startTime && currentTime < skipIntro.endTime) {
      return { label: "Skip Intro", endTime: skipIntro.endTime };
    }
    if (skipOutro && currentTime >= skipOutro.startTime && currentTime < skipOutro.endTime) {
      return { label: "Skip Outro", endTime: skipOutro.endTime };
    }
    return null;
  })();

  // ── EARLY RETURNS ──────────────────────────────────────────────────────────

  if (!servers || servers.length === 0) {
    return (
      <div style={{ width: "100%", aspectRatio: "16/9", background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        No streams available.
      </div>
    );
  }

  if (visibleServers.length === 0) {
    return (
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ width: "100%", aspectRatio: "16/9", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" }}>
          <p style={{ color: "#888", fontSize: "13px" }}>
            No {audioType === "sub" ? "sub" : "dub"} streams available for this episode.
          </p>
          <button
            onClick={() => handleAudioTypeChange(audioType === "sub" ? "dub" : "sub")}
            style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "7px 18px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}
          >
            Switch to {audioType === "sub" ? "Dub" : "Sub"}
          </button>
        </div>
      </div>
    );
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* ── VIDEO PLAYER ── */}
      <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", background: "#000" }}>
        {watchPartyCode && (
          <WatchPartySync
            roomCode={watchPartyCode}
            isHost={isWatchPartyHost ?? false}
            playerRef={playerRef}
            animeId={animeId}
            episodeNum={episodeNum}
            audioType={audioType}
          />
        )}
        {playerError ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#e5e5e5" }}>
            <p style={{ marginBottom: "16px" }}>{playerError}</p>
            <button
              onClick={() => { if (onSourceFailure) onSourceFailure(); else setPlayerError(null); }}
              style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "4px", cursor: "pointer" }}
            >
              Retry
            </button>
          </div>
        ) : (
          <MediaPlayer
            ref={playerRef}
            title={`${animeTitle} - Episode ${episodeNum}`}
            src={{ src: srcUrl, type: activeSource?.isM3U8 ? "application/x-mpegurl" : "video/mp4" }}
            onTimeUpdate={onTimeUpdate}
            onCanPlay={onCanPlay}
            onWaiting={onWaiting}
            onPlaying={onPlaying}
            onProviderChange={onProviderChange}
            onEnded={onEnded}
            onError={onPlaybackError}
            crossOrigin
            playsInline
          >
            <MediaProvider />
            {(activeServer?.subtitles ?? []).map((track, i) => (
              <Track
                key={String(i)}
                src={`/api/subtitle-proxy?url=${encodeURIComponent(track.url)}`}
                kind="subtitles"
                language={track.language}
                label={track.label}
                default={track.default}
              />
            ))}
            <DefaultVideoLayout icons={defaultLayoutIcons} />
          </MediaPlayer>
        )}

        {/* ── SKIP INTRO / OUTRO BUTTON ── */}
        {activeSkip && (
          <div style={{
            position: "absolute",
            bottom: "80px",
            right: "16px",
            zIndex: 50,
            opacity: controlsVisible ? 1 : 0,
            transition: "opacity 0.2s ease-in-out",
            pointerEvents: controlsVisible ? "auto" : "none",
          }}>
            <button
              onClick={() => {
                const player = playerRef.current;
                if (player) player.currentTime = activeSkip.endTime;
              }}
              style={{
                background: "rgba(0,0,0,0.75)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.35)",
                borderRadius: "6px",
                padding: "8px 18px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                backdropFilter: "blur(6px)",
                fontFamily: "inherit",
                transition: "background 150ms ease, border-color 150ms ease",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(255,255,255,0.15)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.6)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(0,0,0,0.75)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.35)";
              }}
            >
              {activeSkip.label} →
            </button>
          </div>
        )}

        {/* ── SERVER TIMEOUT OVERLAY ── */}
        {showServerTimeout && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 100, color: "#fff", gap: "16px" }}>
            <p style={{ fontSize: "15px", fontWeight: 500, textAlign: "center", maxWidth: "320px", lineHeight: 1.5 }}>
              Server timed out. Please try another server.
            </p>
            <button
              onClick={() => setShowServerTimeout(false)}
              style={{ background: "transparent", color: "#e5e5e5", border: "1px solid #555", padding: "7px 20px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── NEXT EPISODE PROMPT ── */}
        {showNextPrompt && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 100, color: "#fff" }}>
            {totalEpisodes && episodeNum >= totalEpisodes && nextAiringEpisode ? (
              <>
                <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "20px", marginBottom: "8px", textAlign: "center" }}>
                  You&apos;re all caught up!
                </h2>
                <p style={{ color: "#a3a3a3", fontSize: "13px", marginBottom: "20px", textAlign: "center" }}>
                  Episode {nextAiringEpisode.episode} is coming in
                </p>
                <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
                  {(() => {
                    const remaining = secondsUntil(nextAiringEpisode.airingAt);
                    return [
                      { label: "Days", value: Math.floor(remaining / 86400) },
                      { label: "Hours", value: Math.floor((remaining % 86400) / 3600) },
                      { label: "Min", value: Math.floor((remaining % 3600) / 60) },
                    ];
                  })().map(({ label, value }) => (
                    <div key={label} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "10px 16px", textAlign: "center", minWidth: "60px" }}>
                      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: "22px", fontWeight: 700, color: "#e5e5e5" }}>
                        {String(value).padStart(2, "0")}
                      </div>
                      <div style={{ color: "#555", fontSize: "10px", textTransform: "uppercase" }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    onClick={() => { setShowNextPrompt(false); if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current); }}
                    style={{ background: "transparent", color: "#e5e5e5", border: "1px solid #2a2a2a", padding: "8px 24px", borderRadius: "6px", cursor: "pointer" }}
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => router.push("/")}
                    style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "8px 24px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                  >
                    Browse Anime
                  </button>
                </div>
              </>
            ) : totalEpisodes && episodeNum >= totalEpisodes ? (
              <>
                <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "20px", marginBottom: "8px", textAlign: "center" }}>
                  You&apos;ve finished this series!
                </h2>
                <p style={{ color: "#a3a3a3", fontSize: "13px", marginBottom: "20px", textAlign: "center" }}>
                  No more episodes available.
                </p>
                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    onClick={() => { setShowNextPrompt(false); if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current); }}
                    style={{ background: "transparent", color: "#e5e5e5", border: "1px solid #2a2a2a", padding: "8px 24px", borderRadius: "6px", cursor: "pointer" }}
                  >
                    Rewatch
                  </button>
                  <button
                    onClick={() => router.push("/")}
                    style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "8px 24px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                  >
                    Browse Anime
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "24px", marginBottom: "16px" }}>Next Episode in 5s…</h2>
                <div style={{ display: "flex", gap: "16px" }}>
                  <button
                    onClick={() => { if (episodeNum < (totalEpisodes ?? Infinity)) router.push(`/watch/${animeId}/${episodeNum + 1}`); }}
                    style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "8px 24px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                  >
                    Play Now
                  </button>
                  <button
                    onClick={() => { setShowNextPrompt(false); if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current); }}
                    style={{ background: "transparent", color: "#e5e5e5", border: "1px solid #2a2a2a", padding: "8px 24px", borderRadius: "6px", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── SUB/DUB TOGGLE + SERVER SELECTION ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", padding: "8px 16px", alignItems: "center", position: "relative" }}>
        {/* Sub/Dub segmented toggle */}
        <div style={{ display: "flex", border: "1px solid #2a2a2a", borderRadius: "6px", overflow: "hidden", marginRight: "4px" }}>
          {(["sub", "dub"] as const).map((type, i) => {
            const isActive   = audioType === type;
            const unavailable = type === "dub" && !hasDub;
            return (
              <button
                key={type}
                onClick={() => !unavailable && handleAudioTypeChange(type)}
                style={{
                  background:  isActive ? "#3b82f6" : "#111",
                  color:       unavailable ? "#3a3a3a" : isActive ? "#fff" : "#a3a3a3",
                  border:      "none",
                  borderRight: i === 0 ? "1px solid #2a2a2a" : "none",
                  padding:     "7px 14px",
                  fontSize:    "12px",
                  fontWeight:  700,
                  letterSpacing: "0.05em",
                  cursor:      unavailable ? "not-allowed" : "pointer",
                  transition:  "background 0.15s, color 0.15s",
                }}
                title={unavailable ? "No dub available for this episode" : undefined}
              >
                {type.toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ width: "1px", height: "20px", background: "#2a2a2a", marginRight: "4px", flexShrink: 0 }} />

        <span style={{ color: "#a3a3a3", fontSize: "14px", alignSelf: "center", marginRight: "4px", fontWeight: 600 }}>Servers:</span>
        {visibleServers.map(server => (
          <button
            key={server.name}
            onClick={() => handleServerChange(server.name)}
            style={{
              background: server.name === selectedServerName ? "#3b82f6" : "#1a1a1a",
              color:      server.name === selectedServerName ? "#fff" : "#a3a3a3",
              border:     `1px solid ${server.name === selectedServerName ? "#3b82f6" : "#333"}`,
              padding:    "8px 14px",
              borderRadius: "6px",
              fontSize:   "13px",
              fontWeight: 500,
              cursor:     "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={e => { if (server.name !== selectedServerName) e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { if (server.name !== selectedServerName) e.currentTarget.style.color = "#a3a3a3"; }}
          >
            {server.name}
          </button>
        ))}
      </div>

      {/* ── MIRROR BADGE ── */}
      {mirrorUsed !== undefined && mirrorUsed >= 1 && (
        <p style={{ color: "#6b7280", fontSize: "11px", margin: "-4px 0 0", padding: "0 16px 8px", userSelect: "none" }}>
          {"● "}
          {mirrorUsed === 1
            ? "Primary mirror"
            : `Mirror ${mirrorUsed} (fallback) · primary ${
                fallbackReason === "timeout"   ? "timed out" :
                fallbackReason === "not_found" ? "returned no streams" :
                "failed"
              }`}
        </p>
      )}
    </div>
  );
}
