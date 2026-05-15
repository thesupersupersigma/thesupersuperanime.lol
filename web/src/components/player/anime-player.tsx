"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MediaPlayer, MediaProvider, MediaPlayerInstance } from "@vidstack/react";
import { defaultLayoutIcons, DefaultVideoLayout } from "@vidstack/react/player/layouts/default";
import { QualityMenu } from "./quality-menu";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import { useRouter } from "next/navigation";

// The new data structure!
export interface ServerData {
  name: string;
  sources: { token: string; quality: string; isM3U8: boolean }[];
}

interface AnimePlayerProps {
  servers: ServerData[];
  animeId: number;
  episodeNum: number;
  animeTitle: string;
}

export function AnimePlayer({ servers, animeId, episodeNum, animeTitle }: AnimePlayerProps) {
  const router = useRouter();
  const playerRef = useRef<MediaPlayerInstance>(null);

  // --- STATE ---
  const [selectedServerName, setSelectedServerName] = useState<string>(servers[0]?.name || "");
  const [selectedQuality, setSelectedQuality] = useState<string>("");
  const [resumeTime, setResumeTime] = useState<number>(0);
  const [showNextPrompt, setShowNextPrompt] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const targetSeekTimeRef = useRef<number | null>(null);
  const lastSavedTimeRef = useRef<number>(0);
  const autoNextTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load saved server preference from LocalStorage on mount
  useEffect(() => {
    const savedServer = localStorage.getItem("preferred-server");
    if (savedServer && servers.find(s => s.name === savedServer)) {
      setSelectedServerName(savedServer);
    } else if (servers.length > 0) {
      setSelectedServerName(servers[0].name);
    }
  }, [servers]);

  // Identify the Active Server and sort its qualities
  const activeServer = servers.find(s => s.name === selectedServerName) || servers[0];
  const sortedQualities = [...(activeServer?.sources || [])]
    .map(s => s.quality)
    .sort((a, b) => (parseInt(b) || 0) - (parseInt(a) || 0));

  // If the server changes, ensure we have a valid quality selected
  useEffect(() => {
    if (!sortedQualities.includes(selectedQuality)) {
      setSelectedQuality(sortedQualities[0] || "auto");
    }
  }, [selectedServerName, sortedQualities, selectedQuality]);

  const activeSource = activeServer?.sources.find((s) => s.quality === selectedQuality) || activeServer?.sources[0];
  const srcUrl = activeSource ? `/api/proxy/${activeSource.token}` : "";

  // Handlers for UI changes
  const handleServerChange = (newServerName: string) => {
    if (newServerName === selectedServerName) return;
    const player = playerRef.current;
    if (player) targetSeekTimeRef.current = player.currentTime; // Remember where we were!
    
    setSelectedServerName(newServerName);
    localStorage.setItem("preferred-server", newServerName);
    setPlayerError(null);
  };

  const handleQualityChange = (newQuality: string) => {
    if (newQuality === selectedQuality) return;
    const player = playerRef.current;
    if (player) targetSeekTimeRef.current = player.currentTime;
    setSelectedQuality(newQuality);
  };

  // --- PROGRESS LOGIC ---
  useEffect(() => {
    async function fetchProgress() {
      try {
        const res = await fetch(`/api/progress?episodeId=${animeId}-${episodeNum}`);
        if (res.ok) {
          const data = await res.json();
          const historyRecord = data.history?.find((h: any) => h.episodeId === `${animeId}-${episodeNum}`);
          if (historyRecord && historyRecord.progress > 30) setResumeTime(historyRecord.progress);
        }
      } catch (err) {}
    }
    fetchProgress();
  }, [animeId, episodeNum]);

  const saveProgress = useCallback(async (currentTime: number, duration: number) => {
    if (currentTime < 1 || duration < 1) return;
    if (Math.abs(currentTime - lastSavedTimeRef.current) < 10 && currentTime !== duration) return;
    lastSavedTimeRef.current = currentTime;

    try {
      await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          animeId: Number(animeId),
          episodeId: `${animeId}-${episodeNum}`,
          progress: Math.floor(currentTime),
          duration: Math.floor(duration),
        })
      });
    } catch (err) {}
  }, [animeId, episodeNum]);

  const onCanPlay = () => {
    const player = playerRef.current;
    if (!player) return;
    if (targetSeekTimeRef.current !== null) {
      player.currentTime = targetSeekTimeRef.current;
      targetSeekTimeRef.current = null;
      setTimeout(async () => {
        try { await player.play(); } catch (err) { /* Browser blocked auto-play */ }
      }, 150);
    }
  };

  const onTimeUpdate = () => {
    const player = playerRef.current;
    if (player) saveProgress(player.currentTime || 0, player.state?.duration || 0);
  };

  const onEnded = () => {
    const player = playerRef.current;
    if (player) saveProgress(player.duration, player.duration);
    setShowNextPrompt(true);
    autoNextTimeoutRef.current = setTimeout(() => { router.push(`/watch/${animeId}/${episodeNum + 1}`); }, 5000);
  };

  useEffect(() => { return () => { if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current); }; }, []);

  if (!servers || servers.length === 0) {
    return <div style={{ width: "100%", aspectRatio: "16/9", background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>No streams available.</div>;
  }

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* VIDEO PLAYER */}
      <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", background: "#000" }}>
        {playerError ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#e5e5e5" }}>
            <p style={{ marginBottom: "16px" }}>{playerError}</p>
            <button onClick={() => setPlayerError(null)} style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "4px", cursor: "pointer" }}>Retry</button>
          </div>
        ) : (
          <MediaPlayer
            ref={playerRef}
            title={`${animeTitle} - Episode ${episodeNum}`}
            src={{ src: srcUrl, type: activeSource?.isM3U8 ? "application/x-mpegurl" : "video/mp4" }}
            currentTime={resumeTime}
            onTimeUpdate={onTimeUpdate}
            onCanPlay={onCanPlay}
            onEnded={onEnded}
            onError={() => setPlayerError("Stream unavailable — try another server")}
            crossOrigin
            playsInline
            preferNativeHLS
          >
            <MediaProvider />
            <DefaultVideoLayout icons={defaultLayoutIcons} />
            <QualityMenu qualities={sortedQualities} selectedQuality={selectedQuality} onSelect={handleQualityChange} />
          </MediaPlayer>
        )}

        {/* NEXT EPISODE PROMPT */}
        {showNextPrompt && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 100, color: "#fff" }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "24px", marginBottom: "16px" }}>Next Episode in 5s...</h2>
            <div style={{ display: "flex", gap: "16px" }}>
              <button onClick={() => router.push(`/watch/${animeId}/${episodeNum + 1}`)} style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "8px 24px", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}>Play Now</button>
              <button onClick={() => { setShowNextPrompt(false); if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current); }} style={{ background: "transparent", color: "#e5e5e5", border: "1px solid #2a2a2a", padding: "8px 24px", borderRadius: "6px", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* SERVER SELECTION UI */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", padding: "8px 0" }}>
        <span style={{ color: "#a3a3a3", fontSize: "14px", alignSelf: "center", marginRight: "8px", fontWeight: 600 }}>Servers:</span>
        {servers.map((server) => (
          <button
            key={server.name}
            onClick={() => handleServerChange(server.name)}
            style={{
              background: server.name === selectedServerName ? "#3b82f6" : "#1a1a1a",
              color: server.name === selectedServerName ? "#fff" : "#a3a3a3",
              border: `1px solid ${server.name === selectedServerName ? "#3b82f6" : "#333"}`,
              padding: "8px 14px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
            onMouseEnter={(e) => {
              if (server.name !== selectedServerName) e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              if (server.name !== selectedServerName) e.currentTarget.style.color = "#a3a3a3";
            }}
          >
            {server.name}
          </button>
        ))}
      </div>
    </div>
  );
}