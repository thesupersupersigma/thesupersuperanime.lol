"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MediaPlayer, MediaProvider, MediaPlayerInstance } from "@vidstack/react";
import { defaultLayoutIcons, DefaultVideoLayout } from "@vidstack/react/player/layouts/default";
import { QualityMenu } from "./quality-menu";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import { useRouter } from "next/navigation";

interface AnimePlayerProps {
  sources: { token: string; quality: string; isM3U8: boolean }[];
  animeId: number;
  episodeNum: number;
  animeTitle: string;
}

export function AnimePlayer({
  sources,
  animeId,
  episodeNum,
  animeTitle,
}: AnimePlayerProps) {
  const router = useRouter();
  const playerRef = useRef<MediaPlayerInstance>(null);
  
  // Sort qualities highest to lowest to pick a default
  const sortedQualities = [...sources].map(s => s.quality).sort((a, b) => {
    const resA = parseInt(a) || 0;
    const resB = parseInt(b) || 0;
    return resB - resA;
  });

  const [selectedQuality, setSelectedQuality] = useState(sortedQualities[0] || "unknown");
  const [resumeTime, setResumeTime] = useState<number>(0);
  const [showNextPrompt, setShowNextPrompt] = useState(false);
  const targetSeekTimeRef = useRef<number | null>(null);
  const lastSavedTimeRef = useRef<number>(0);
  const autoNextTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const activeSource = sources.find((s) => s.quality === selectedQuality) || sources[0];
  const srcUrl = `/api/proxy/${activeSource.token}`;

  useEffect(() => {
    async function fetchProgress() {
      try {
        const res = await fetch(`/api/progress?episodeId=${animeId}-${episodeNum}`);
        if (res.ok) {
          const data = await res.json();
          const historyRecord = data.history?.find(
            (h: { episodeId: string; progress: number }) => h.episodeId === `${animeId}-${episodeNum}`
          );
          if (historyRecord && historyRecord.progress > 30) {
            setResumeTime(historyRecord.progress);
          }
        }
      } catch (err) {
        console.error("Failed to fetch progress", err);
      }
    }
    fetchProgress();
  }, [animeId, episodeNum]);

  const saveProgress = useCallback(async (currentTime: number, duration: number) => {
    if (currentTime < 1 || duration < 1) return;
    
    if (Math.abs(currentTime - lastSavedTimeRef.current) < 10 && currentTime !== duration) {
      return;
    }
    
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
    } catch (err) {
      console.error("Failed to save progress", err);
    }
  }, [animeId, episodeNum]);

  const handleQualityChange = (newQuality: string) => {
    if (newQuality === selectedQuality) return;
    
    const player = playerRef.current;
    if (player) {
      targetSeekTimeRef.current = player.currentTime;
    }
    setSelectedQuality(newQuality);
  };

  const onCanPlay = () => {
    const player = playerRef.current;
    if (!player) return;

    // THE FIX: Gracefully handle the quality switch without throwing an AbortError!
    if (targetSeekTimeRef.current !== null) {
      player.currentTime = targetSeekTimeRef.current;
      targetSeekTimeRef.current = null;
      
      // Give the browser 150ms to flush the old video buffer before forcing play
      setTimeout(async () => {
        try {
          await player.play();
        } catch (err) {
          // If the browser still blocks it, we catch it silently so it doesn't crash the player!
          console.warn("Browser interrupted auto-play during quality switch. Waiting for user interaction.");
        }
      }, 150);
    }
  };

  const onTimeUpdate = () => {
    const player = playerRef.current;
    if (player) {
      const currentTime = player.currentTime || 0;
      const duration = player.state?.duration || 0;
      saveProgress(currentTime, duration);
    }
  };

  const onEnded = () => {
    const player = playerRef.current;
    if (player) {
      saveProgress(player.duration, player.duration);
    }
    setShowNextPrompt(true);
    autoNextTimeoutRef.current = setTimeout(() => {
      router.push(`/watch/${animeId}/${episodeNum + 1}`);
    }, 5000);
  };

  const cancelAutoNext = () => {
    setShowNextPrompt(false);
    if (autoNextTimeoutRef.current) {
      clearTimeout(autoNextTimeoutRef.current);
    }
  };

  const [playerError, setPlayerError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current);
    };
  }, []);

  const onError = (e: unknown) => {
    console.error("Player error:", e);
    setPlayerError("Stream unavailable — try another episode");
  };

  if (playerError) {
    return (
      <div style={{ width: "100%", aspectRatio: "16/9", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#e5e5e5" }}>
        <p style={{ marginBottom: "16px" }}>{playerError}</p>
        <button
          onClick={() => window.location.reload()}
          style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "4px", cursor: "pointer" }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", background: "#000" }}>
      <MediaPlayer
        ref={playerRef}
        title={`${animeTitle} - Episode ${episodeNum}`}
        src={{ 
          src: srcUrl, 
          type: activeSource.isM3U8 ? "application/x-mpegurl" : "video/mp4" 
        }}
        currentTime={resumeTime}
        onTimeUpdate={onTimeUpdate}
        onCanPlay={onCanPlay}
        onEnded={onEnded}
        onError={onError}
        crossOrigin
        playsInline
        preferNativeHLS
      >
        <MediaProvider />
        <DefaultVideoLayout icons={defaultLayoutIcons} />
        
        <QualityMenu 
          qualities={sortedQualities} 
          selectedQuality={selectedQuality} 
          onSelect={handleQualityChange} 
        />
      </MediaPlayer>

      {showNextPrompt && (
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.8)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          color: "#fff"
        }}>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "24px", marginBottom: "16px" }}>
            Next Episode in 5s...
          </h2>
          <div style={{ display: "flex", gap: "16px" }}>
            <button
              onClick={() => router.push(`/watch/${animeId}/${episodeNum + 1}`)}
              style={{
                background: "#3b82f6", color: "#fff", border: "none",
                padding: "8px 24px", borderRadius: "6px", cursor: "pointer",
                fontWeight: 600
              }}
            >
              Play Now
            </button>
            <button
              onClick={cancelAutoNext}
              style={{
                background: "transparent", color: "#e5e5e5", border: "1px solid #2a2a2a",
                padding: "8px 24px", borderRadius: "6px", cursor: "pointer"
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}