"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaPlayerInstance } from "@vidstack/react";

interface WatchPartySyncProps {
  roomCode: string;
  isHost: boolean;
  playerRef: React.RefObject<MediaPlayerInstance | null>;
  animeId: number;
  episodeNum: number;
}

// Drift correction: hard-seek the guest only when it has drifted more than 1s
// from the host, but ignore drifts of 60s+ (a manifest reload / fresh join can
// momentarily report a wild currentTime — don't yank the user across the video).
const DRIFT_MIN = 1;
const DRIFT_MAX = 60;

export function WatchPartySync({ roomCode, isHost, playerRef, animeId, episodeNum }: WatchPartySyncProps) {
  const [copied, setCopied] = useState(false);
  const [hostLeft, setHostLeft] = useState(false);
  const [hostAction, setHostAction] = useState<string | null>(null);

  // ── HOST: push position every 500ms (+ immediate push on play/pause) ───────
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (!isHost) return;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const isPlaying = !player.paused;

      // Play/pause just toggled — push immediately so guests react with minimal
      // lag instead of waiting up to a full tick.
      if (isPlaying !== wasPlayingRef.current) {
        wasPlayingRef.current = isPlaying;
        fetch(`/api/watch-party/${roomCode}/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timestamp: player.currentTime || 0, isPlaying }),
        }).catch(() => {});
      }

      // Regular heartbeat push.
      const timestamp = player.currentTime || 0;
      fetch(`/api/watch-party/${roomCode}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timestamp, isPlaying }),
      }).catch(() => {});
    }, 500);
    return () => clearInterval(interval);
  }, [isHost, roomCode, playerRef]);

  // ── GUEST: subscribe to host state via SSE ────────────────────────────────
  const connectedRef = useRef(false);
  const hostLeftRef = useRef(false);
  useEffect(() => {
    if (isHost) return;
    const es = new EventSource(`/api/watch-party/${roomCode}/stream`);

    const markHostLeft = () => {
      if (hostLeftRef.current) return;
      hostLeftRef.current = true;
      setHostLeft(true);
      es.close();
    };

    es.onmessage = (e) => {
      let data: { hostTimestamp?: number; isPlaying?: boolean; error?: string };
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      connectedRef.current = true;
      if (data.error) {
        console.log(`[watch-party] room ${roomCode} ${data.error}`);
        markHostLeft();
        return;
      }
      if (hostLeftRef.current) return; // stop applying updates once the host is gone
      const player = playerRef.current;
      if (!player) return;

      if (typeof data.hostTimestamp === "number") {
        const drift = Math.abs(player.currentTime - data.hostTimestamp);
        if (drift > DRIFT_MIN && drift < DRIFT_MAX) {
          player.currentTime = data.hostTimestamp;
        }
      }
      if (typeof data.isPlaying === "boolean") {
        const playing = !player.paused;
        if (data.isPlaying !== playing) {
          if (data.isPlaying) {
            player.play().catch(() => {});
            setHostAction("▶ Resumed by host");
            setTimeout(() => setHostAction(null), 2000);
          } else {
            player.pause();
            setHostAction("⏸ Paused by host");
            setTimeout(() => setHostAction(null), 2000);
          }
        }
      }
    };

    es.onerror = () => {
      console.log(`[watch-party] SSE error for room ${roomCode}`);
      // A transient error before we ever connected is just EventSource retrying.
      // An error AFTER the stream was established means the host's room is gone.
      if (connectedRef.current) markHostLeft();
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
        flexDirection: "column",
        gap: "4px",
        background: "rgba(0,0,0,0.75)",
        border: "1px solid #2a2a2a",
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "12px",
        color: "#e5e5e5",
        backdropFilter: "blur(6px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
        {hostLeft ? (
          <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "#a3a3a3" }}>
            ⚠ Host left
          </span>
        ) : (
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
        )}
      </div>
      {hostAction && (
        <span style={{ fontSize: "11px", color: "#a3a3a3" }}>{hostAction}</span>
      )}
    </div>
  );
}
