"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MediaPlayer, MediaProvider, MediaPlayerInstance } from "@vidstack/react";
import { defaultLayoutIcons, DefaultVideoLayout } from "@vidstack/react/player/layouts/default";
import { isHLSProvider } from "vidstack";
import { QualityMenu } from "./quality-menu";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import { useRouter } from "next/navigation";

export interface ServerData {
  name: string;
  type: "sub" | "dub";
  sources: { token: string; quality: string; isM3U8: boolean }[];
}

interface AnimePlayerProps {
  servers: ServerData[];
  animeId: number;
  episodeNum: number;
  animeTitle: string;
  mirrorUsed?: number;
  fallbackReason?: string;
  // Called when playback fails fatally (commonly dead/expired proxy tokens) so
  // the parent can re-fetch fresh sources. SourceLoader guards against loops.
  onSourceFailure?: () => void;
}

export function AnimePlayer({
  servers, animeId, episodeNum, animeTitle, mirrorUsed, fallbackReason, onSourceFailure,
}: AnimePlayerProps) {
  const router = useRouter();
  const playerRef = useRef<MediaPlayerInstance>(null);

  // --- STATE ---
  const [audioType, setAudioType]             = useState<"sub" | "dub">("sub");
  const [selectedServerName, setSelectedServerName] = useState<string>("");
  const [selectedQuality, setSelectedQuality] = useState<string>("");
  const [showNextPrompt, setShowNextPrompt]   = useState(false);
  const [playerError, setPlayerError]         = useState<string | null>(null);
  const [currentTime, setCurrentTime]         = useState(0);
  const [duration, setDuration]               = useState(0);
  // True when the server hasn't produced any playable output within 14 s.
  const [showServerTimeout, setShowServerTimeout] = useState(false);

  // --- REFS ---
  const targetSeekTimeRef     = useRef<number | null>(null);
  const lastSavedTimeRef      = useRef<number>(0);
  const durationRef           = useRef<number>(0);          // avoids stale closure in onTimeUpdate
  const autoNextTimeoutRef    = useRef<NodeJS.Timeout | null>(null);
  const serverTimeoutTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Resume-seek refs: avoid passing resumeTime as a reactive prop so the seek
  // only fires once the player is ready to buffer that position.
  const pendingResumeRef    = useRef<number | null>(null); // saved progress, set by fetchProgress
  const playerReadyRef      = useRef<boolean>(false);      // true after first canplay fires
  const hasResumedRef       = useRef<boolean>(false);      // ensures we seek at most once

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

    setAudioType(targetType);

    const available = servers.filter(s => s.type === targetType);
    if (savedServer && available.find(s => s.name === savedServer)) {
      setSelectedServerName(savedServer);
    } else if (available.length > 0) {
      setSelectedServerName(available[0].name);
    }
  }, [servers]);

  // Identify the active server within the visible set and sort its qualities
  const activeServer    = visibleServers.find(s => s.name === selectedServerName) || visibleServers[0];
  const sortedQualities = [...(activeServer?.sources || [])]
    .map(s => s.quality)
    .sort((a, b) => (parseInt(b) || 0) - (parseInt(a) || 0));

  // If the server changes, ensure we have a valid quality selected
  useEffect(() => {
    if (!sortedQualities.includes(selectedQuality)) {
      setSelectedQuality(sortedQualities[0] || "auto");
    }
  }, [selectedServerName, audioType, sortedQualities, selectedQuality]);

  // ── SERVER TIMEOUT ─────────────────────────────────────────────────────────
  // Arms a 14 s timer every time the selected server changes (including the
  // initial load). The timer is cancelled in onCanPlay / onPlaying — both are
  // reliable signals that the server is alive. If neither fires within 14 s the
  // overlay is shown so the user can manually switch to another server.
  useEffect(() => {
    if (!selectedServerName) return;
    setShowServerTimeout(false);
    if (serverTimeoutTimerRef.current) clearTimeout(serverTimeoutTimerRef.current);
    serverTimeoutTimerRef.current = setTimeout(() => setShowServerTimeout(true), 14000);
    return () => {
      if (serverTimeoutTimerRef.current) clearTimeout(serverTimeoutTimerRef.current);
    };
  }, [selectedServerName]);

  const activeSource = activeServer?.sources.find(s => s.quality === selectedQuality) || activeServer?.sources[0];
  const srcUrl       = activeSource ? `/api/proxy/${activeSource.token}` : "";

  // ── SERVER / AUDIO / QUALITY HANDLERS ─────────────────────────────────────

  const handleServerChange = (newServerName: string) => {
    if (newServerName === selectedServerName) return;
    const player = playerRef.current;
    if (player) targetSeekTimeRef.current = player.currentTime;
    setSelectedServerName(newServerName);
    localStorage.setItem("preferred-server", newServerName);
    setPlayerError(null);
  };

  const handleAudioTypeChange = (newType: "sub" | "dub") => {
    if (newType === audioType) return;
    const player = playerRef.current;
    if (player) targetSeekTimeRef.current = player.currentTime;
    setAudioType(newType);
    setPlayerError(null);
    localStorage.setItem("preferred-audio", newType);
    const available = servers.filter(s => s.type === newType);
    if (available.length > 0 && !available.find(s => s.name === selectedServerName)) {
      setSelectedServerName(available[0].name);
    }
  };

  const handleQualityChange = (newQuality: string) => {
    if (newQuality === selectedQuality) return;
    const player = playerRef.current;
    if (player) targetSeekTimeRef.current = player.currentTime;
    setSelectedQuality(newQuality);
  };

  // ── PROGRESS LOGIC ─────────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchProgress() {
      try {
        const res = await fetch(`/api/progress?episodeId=${animeId}-${episodeNum}`);
        if (res.ok) {
          const data = await res.json();
          const rec  = data.history?.find((h: { episodeId: string; progress: number }) => h.episodeId === `${animeId}-${episodeNum}`);
          // Only resume if the saved position is meaningfully into the video (>10 s).
          if (rec && rec.progress > 10) {
            pendingResumeRef.current = rec.progress;
            // If canplay already fired before the fetch returned, seek immediately.
            if (playerReadyRef.current && !hasResumedRef.current) {
              hasResumedRef.current = true;
              if (playerRef.current) playerRef.current.currentTime = rec.progress;
            }
          }
        }
      } catch {}
    }
    fetchProgress();
  }, [animeId, episodeNum]);

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

    playerReadyRef.current = true;

    // Server / audio / quality switch — restore playback position and resume.
    if (targetSeekTimeRef.current !== null) {
      player.currentTime = targetSeekTimeRef.current;
      targetSeekTimeRef.current = null;
      setTimeout(async () => {
        try { await player.play(); } catch { /* browser blocked auto-play */ }
      }, 150);
      return;
    }

    // Saved-progress resume — seek only if we haven't done so yet and there is a
    // pending resume position (set by fetchProgress). The >10 s guard already lives
    // in fetchProgress; we just trust pendingResumeRef here.
    if (!hasResumedRef.current && pendingResumeRef.current !== null) {
      hasResumedRef.current    = true;
      player.currentTime       = pendingResumeRef.current;
      pendingResumeRef.current = null;
    }
  };

  // ── STALL & FAILURE RECOVERY ─────────────────────────────────────────────
  // Three independent layers, in order of how often they fire:
  //
  //   1. onProviderChange tunes hls.js to clear buffer holes on its own, so an
  //      aggressive seek doesn't strand the player on a gap in the first place.
  //
  //   2. onWaiting watchdog catches a stall that produces no error at all (e.g.
  //      a quietly hung segment fetch): after 6 s we re-kick the loader with
  //      startLoad() — no position argument, since passing one previously made
  //      the player jump to the end of the episode.
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
      const provider = player.provider;
      if (isHLSProvider(provider) && provider.instance) {
        provider.instance.startLoad();              // resume loading from current position
      } else {
        player.currentTime = player.currentTime + 0.1; // native HLS / MP4 nudge
      }
    }, 6000);
  }, [clearStallTimer]);

  const onPlaying = useCallback(() => {
    clearStallTimer();
    // Playback actually started — server is alive, no need for the timeout overlay.
    if (serverTimeoutTimerRef.current) clearTimeout(serverTimeoutTimerRef.current);
    setShowServerTimeout(false);
  }, [clearStallTimer]);

  // Make hls.js tolerate buffer holes so a hard seek clears itself rather than
  // stalling. Config must be set here, before the instance is created.
  const onProviderChange = (provider: unknown) => {
    if (isHLSProvider(provider)) {
      provider.config = {
        ...provider.config,
        maxBufferHole: 0.5, // jump holes up to 0.5s instead of stalling (default 0.1)
        nudgeMaxRetry: 5,   // more automatic nudge attempts before a stall turns fatal
      };
    }
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
    }

    saveProgress(t, d);
  };

  const onEnded = () => {
    const player = playerRef.current;
    if (player) saveProgress(player.duration, player.duration);
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
            preferNativeHLS
          >
            <MediaProvider />
            <DefaultVideoLayout icons={defaultLayoutIcons} />
            <QualityMenu qualities={sortedQualities} selectedQuality={selectedQuality} onSelect={handleQualityChange} />
          </MediaPlayer>
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
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "24px", marginBottom: "16px" }}>Next Episode in 5s…</h2>
            <div style={{ display: "flex", gap: "16px" }}>
              <button
                onClick={() => router.push(`/watch/${animeId}/${episodeNum + 1}`)}
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
