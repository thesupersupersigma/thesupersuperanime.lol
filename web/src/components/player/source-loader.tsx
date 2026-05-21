"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimePlayer, ServerData } from "./anime-player"; // import ServerData from the player

interface SourceLoaderProps {
  animeId: number;
  episodeNum: number;
  animeTitle: string;
}

type LoadingPhase = "idle" | "loading" | "waking" | "done" | "error";

export function SourceLoader({ animeId, episodeNum, animeTitle }: SourceLoaderProps) {
  const [servers, setServers] = useState<ServerData[] | null>(null); // use ServerData, not inline type
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<LoadingPhase>("idle");
  const hasFetched = useRef(false);

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
      setPhase("done");
    } catch (err) {
      clearTimeout(wakeTimer);
      console.error("[SourceLoader]", err);
      setError("Stream unavailable — try another server or episode");
      setPhase("error");
    }
  }, [animeId, episodeNum, animeTitle]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadSources();
  }, [loadSources]);

  if (phase === "error") {
    return (
      <div style={containerStyle}>
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
    return (
      <div style={containerStyle}>
        <div style={{
          width: "36px", height: "36px",
          border: "3px solid rgba(59,130,246,0.2)",
          borderTopColor: "#3b82f6",
          borderRadius: "50%",
          animation: "spin 0.9s linear infinite",
          marginBottom: "16px",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: "#888", fontSize: "13px", textAlign: "center" }}>
          {phase === "waking" ? "Waking up scraper — hang tight..." : "Finding stream..."}
        </p>
        {phase === "waking" && (
          <p style={{ color: "#555", fontSize: "12px", marginTop: "8px", textAlign: "center" }}>
            First load can take ~10s
          </p>
        )}
      </div>
    );
  }

  if (!servers) return null;

  return (
    <AnimePlayer
      servers={servers}
      animeId={animeId}
      episodeNum={episodeNum}
      animeTitle={animeTitle}
    />
  );
}

const containerStyle: React.CSSProperties = {
  width: "100%",
  aspectRatio: "16/9",
  background: "#000",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};