"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimePlayer } from "./anime-player";

interface SourceLoaderProps {
  animeId: number;
  episodeNum: number;
  animeTitle: string;
}

export function SourceLoader({ animeId, episodeNum, animeTitle }: SourceLoaderProps) {
  const [sources, setSources] = useState<{ token: string; quality: string; isM3U8: boolean }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSlow, setIsSlow] = useState(false);

  const hasFetched = useRef(false);

  const loadSources = useCallback(async () => {
    setError(null);
    setIsSlow(false);
    
    const slowTimeout = setTimeout(() => setIsSlow(true), 5000);

    try {
      const res = await fetch("/api/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId, episodeNum, animeTitle }),
      });

      if (!res.ok) {
        throw new Error(`Failed with status ${res.status}`);
      }

      const data = await res.json();
      if (!data.sources || data.sources.length === 0) {
        throw new Error("No sources found");
      }

      setSources(data.sources);
    } catch (err) {
      console.error(err);
      setError("Stream unavailable — try another episode");
    } finally {
      clearTimeout(slowTimeout);
    }
  }, [animeId, episodeNum, animeTitle]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadSources();
  }, [loadSources]);

  if (error) {
    return (
      <div style={{ width: "100%", aspectRatio: "16/9", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#e5e5e5" }}>
        <p style={{ marginBottom: "16px" }}>{error}</p>
        <button
          onClick={loadSources}
          style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "4px", cursor: "pointer" }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!sources) {
    return (
      <div style={{ width: "100%", aspectRatio: "16/9", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#e5e5e5" }}>
        <div style={{
          width: "40px", height: "40px", border: "3px solid rgba(59,130,246,0.3)",
          borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 1s linear infinite",
          marginBottom: "16px"
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        {isSlow && <p style={{ color: "#888", fontSize: "14px" }}>Finding stream...</p>}
      </div>
    );
  }

  return (
    <AnimePlayer 
      sources={sources} 
      animeId={animeId} 
      episodeNum={episodeNum} 
      animeTitle={animeTitle} 
    />
  );
}
