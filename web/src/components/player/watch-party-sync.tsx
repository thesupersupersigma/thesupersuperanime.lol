"use client";

import { useEffect, useState } from "react";
import type { MediaPlayerInstance } from "@vidstack/react";

interface WatchPartySyncProps {
  roomCode: string;
  isHost: boolean;
  playerRef: React.RefObject<MediaPlayerInstance | null>;
  animeId: number;
  episodeNum: number;
}

// How far (seconds) the guest may drift from the host before we hard-seek.
// Kept loose to avoid constant re-seeking from ordinary network jitter.
const SYNC_TOLERANCE = 3;

export function WatchPartySync({ roomCode, isHost, playerRef, animeId, episodeNum }: WatchPartySyncProps) {
  const [copied, setCopied] = useState(false);

  // ── HOST: push position every 2s ──────────────────────────────────────────
  useEffect(() => {
    if (!isHost) return;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const timestamp = player.currentTime || 0;
      const isPlaying = !player.paused;
      fetch(`/api/watch-party/${roomCode}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timestamp, isPlaying }),
      }).catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [isHost, roomCode, playerRef]);

  // ── GUEST: subscribe to host state via SSE ────────────────────────────────
  useEffect(() => {
    if (isHost) return;
    const es = new EventSource(`/api/watch-party/${roomCode}/stream`);

    es.onmessage = (e) => {
      let data: { hostTimestamp?: number; isPlaying?: boolean; error?: string };
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      if (data.error) {
        console.log(`[watch-party] room ${roomCode} ${data.error}`);
        es.close();
        return;
      }
      const player = playerRef.current;
      if (!player) return;

      if (typeof data.hostTimestamp === "number") {
        if (Math.abs(player.currentTime - data.hostTimestamp) > SYNC_TOLERANCE) {
          player.currentTime = data.hostTimestamp;
        }
      }
      if (typeof data.isPlaying === "boolean") {
        const playing = !player.paused;
        if (data.isPlaying !== playing) {
          if (data.isPlaying) player.play().catch(() => {});
          else player.pause();
        }
      }
    };

    es.onerror = () => {
      console.log(`[watch-party] SSE error for room ${roomCode}`);
    };

    return () => es.close();
  }, [isHost, roomCode, playerRef]);

  const joinUrl = `https://www.thesupersuperanime.lol/watch/${animeId}/${episodeNum}?party=${roomCode}`;

  const copyLink = () => {
    navigator.clipboard.writeText(joinUrl).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };

  return (
    <div
      style={{
        position: "absolute",
        top: "12px",
        left: "12px",
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        gap: "10px",
        background: "rgba(0,0,0,0.75)",
        border: "1px solid #2a2a2a",
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "12px",
        color: "#e5e5e5",
        backdropFilter: "blur(6px)",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: "5px", fontWeight: 600 }}>
        🎬 Watch Party
      </span>
      <span style={{ color: "#a3a3a3" }}>Room: {roomCode}</span>
      <button
        onClick={copyLink}
        style={{
          background: "transparent",
          border: "1px solid #2a2a2a",
          borderRadius: "5px",
          color: "#e5e5e5",
          padding: "3px 8px",
          fontSize: "11px",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {copied ? "Copied!" : "Copy Link"}
      </button>
      <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
        <span
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: isHost ? "#22c55e" : "#3b82f6",
          }}
        />
        {isHost ? "Hosting" : "Syncing"}
      </span>
    </div>
  );
}
