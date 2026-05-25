"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimePlayer, ServerData } from "./anime-player";

interface SourceLoaderProps {
  animeId: number;
  episodeNum: number;
  animeTitle: string;
}

type LoadingPhase = "idle" | "loading" | "waking" | "done" | "error";

const SKELETON_PULSE = `
  @keyframes playerPulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.45; }
  }
`;

function PlayerSkeleton({ waking }: { waking: boolean }) {
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "12px" }}>
      <style>{SKELETON_PULSE}</style>

      {/* Video rectangle */}
      <div style={{
        width: "100%",
        aspectRatio: "16/9",
        background: "#111",
        border: "1px solid #2a2a2a",
        borderRadius: "4px",
        animation: "playerPulse 2s ease-in-out infinite",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: "14px",
      }}>
        {waking && (
          <span style={{ color: "#3a3a3a", fontSize: "12px" }}>
            Waking up scraper — first load ~10s
          </span>
        )}
      </div>

      {/* Server selector skeleton */}
      <div style={{ display: "flex", gap: "8px" }}>
        {[72, 64, 60].map((w, i) => (
          <div key={i} style={{
            width: w,
            height: 30,
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            borderRadius: "6px",
            animation: "playerPulse 2s ease-in-out infinite",
            animationDelay: `${i * 120}ms`,
          }} />
        ))}
      </div>

      {/* Title / episode info skeleton */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "4px" }}>
        <div style={{
          height: 16,
          width: "52%",
          background: "#1a1a1a",
          borderRadius: "4px",
          animation: "playerPulse 2s ease-in-out infinite",
        }} />
        <div style={{
          height: 12,
          width: "28%",
          background: "#1a1a1a",
          borderRadius: "4px",
          animation: "playerPulse 2s ease-in-out infinite",
          animationDelay: "80ms",
        }} />
      </div>
    </div>
  );
}

export function SourceLoader({ animeId, episodeNum, animeTitle }: SourceLoaderProps) {
  const [servers, setServers] = useState<ServerData[] | null>(null);
  const [mirrorUsed, setMirrorUsed] = useState<number | undefined>(undefined);
  const [fallbackReason, setFallbackReason] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<LoadingPhase>("idle");
  const hasFetched = useRef(false);
  const lastLoadAtRef = useRef(0);       // when sources last loaded successfully
  const reloadAttemptsRef = useRef(0);   // consecutive rapid reloads — loop guard

  const loadSources = useCallback(async () => {
    setError(null);
    setPhase("loading");

    const wakeTimer = setTimeout(() => setPhase("waking"), 4000);

    try {
      const res = await fetch("/api/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId, episodeNum, animeTitle }),
      });

      clearTimeout(wakeTimer);

      if (!res.ok) throw new Error(`Status ${res.status}`);

      const data = await res.json();

      if (!data.servers || data.servers.length === 0) {
        throw new Error("No sources found");
      }

      setServers(data.servers);
      setMirrorUsed(data.mirrorUsed);
      setFallbackReason(data.fallbackReason);
      setPhase("done");
      lastLoadAtRef.current = Date.now();
    } catch (err) {
      clearTimeout(wakeTimer);
      console.error("[SourceLoader]", err);
      setError("Stream unavailable — try another server or episode");
      setPhase("error");
    }
  }, [animeId, episodeNum, animeTitle]);

  // The player calls this when playback dies on dead tokens (expiry / upstream
  // drop). Re-fetch fresh sources, but bail to the error UI if it's looping —
  // a stream that fails again within 60 s of reloading won't be fixed by more
  // reloads, whereas a token that expires hours later legitimately needs one.
  const reloadSources = useCallback(() => {
    const now = Date.now();
    reloadAttemptsRef.current =
      now - lastLoadAtRef.current < 60_000 ? reloadAttemptsRef.current + 1 : 1;
    if (reloadAttemptsRef.current > 2) {
      setError("Stream keeps dropping — try another server or reload the page");
      setPhase("error");
      return;
    }
    loadSources();
  }, [loadSources]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadSources();
  }, [loadSources]);

  if (phase === "error") {
    return (
      <div style={errorContainerStyle}>
        <p style={{ color: "#e5e5e5", marginBottom: "16px", fontSize: "14px" }}>{error}</p>
        <button
          onClick={() => { hasFetched.current = false; loadSources(); }}
          style={{
            background: "#3b82f6", color: "#fff", border: "none",
            padding: "8px 20px", borderRadius: "6px", cursor: "pointer",
            fontSize: "14px", fontWeight: 600,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (phase === "loading" || phase === "waking") {
    return <PlayerSkeleton waking={phase === "waking"} />;
  }

  if (!servers) return null;

  return (
    <AnimePlayer
      servers={servers}
      animeId={animeId}
      episodeNum={episodeNum}
      animeTitle={animeTitle}
      mirrorUsed={mirrorUsed}
      fallbackReason={fallbackReason}
      onSourceFailure={reloadSources}
    />
  );
}

const errorContainerStyle: React.CSSProperties = {
  width: "100%",
  aspectRatio: "16/9",
  background: "#000",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};
