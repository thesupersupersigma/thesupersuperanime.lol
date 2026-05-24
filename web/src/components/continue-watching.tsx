"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface HistoryEntry {
  animeId: number;
  episodeId: string;
  progress: number;
  duration: number;
  updatedAt: string;
  title?: string;
  cover?: string;
}

function formatProgress(progress: number, duration: number): number {
  if (!duration) return 0;
  return Math.round((progress / duration) * 100);
}

export function ContinueWatching() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/progress");
        if (!res.ok) return;
        const data = await res.json();
        const history = (data.history ?? []).slice(0, 10);

        // Enrich with AniList metadata
        const enriched = await Promise.all(
          history.map(async (h: HistoryEntry) => {
            try {
              const r = await fetch(`/api/anilist/${h.animeId}`);
              if (!r.ok) return h;
              const d = await r.json();
              return {
                ...h,
                title: d.anime?.title?.english || d.anime?.title?.romaji || `Anime #${h.animeId}`,
                cover: d.anime?.coverImage?.large ?? "",
              };
            } catch {
              return h;
            }
          })
        );

        setEntries(enriched.filter((e: HistoryEntry) => e.progress > 10));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="scroll-row">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            width: "160px", minWidth: "140px", flexShrink: 0,
            borderRadius: "8px", overflow: "hidden",
            border: "1px solid #1a1a1a",
          }}>
            <div style={{ width: "100%", paddingTop: "140%", background: "#111" }} />
            <div style={{ padding: "8px", background: "#0f0f0f" }}>
              <div style={{ height: "10px", background: "#1a1a1a", borderRadius: "4px", marginBottom: "6px" }} />
              <div style={{ height: "3px", background: "#1a1a1a", borderRadius: "2px" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={{ padding: "32px 0", textAlign: "center", color: "#444", fontSize: "13px" }}>
        Nothing here yet. Start watching something.
      </div>
    );
  }

  return (
    <div className="scroll-row">
      {entries.map((entry) => {
        const [animeId, epNum] = entry.episodeId.split("-");
        const pct = formatProgress(entry.progress, entry.duration);

        return (
          <Link
            key={entry.episodeId}
            href={`/watch/${animeId}/${epNum}`}
            style={{ textDecoration: "none", width: "160px", minWidth: "140px", flexShrink: 0 }}
          >
            <div style={{
              borderRadius: "8px", overflow: "hidden",
              border: "1px solid #1a1a1a", transition: "border-color 0.15s",
              position: "relative",
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#2a2a2a")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#1a1a1a")}
            >
              {entry.cover ? (
                <Image
                  src={entry.cover}
                  alt={entry.title ?? ""}
                  width={160}
                  height={224}
                  style={{ width: "100%", height: "auto", display: "block", objectFit: "cover" }}
                />
              ) : (
                <div style={{ width: "100%", paddingTop: "140%", background: "#111" }} />
              )}

              {/* Episode badge */}
              <div style={{
                position: "absolute", top: "6px", left: "6px",
                background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
                color: "#e5e5e5", fontSize: "10px", fontWeight: 600,
                padding: "2px 6px", borderRadius: "4px",
              }}>
                EP {epNum}
              </div>

              <div style={{ padding: "8px", background: "#0f0f0f" }}>
                <div style={{
                  color: "#e5e5e5", fontSize: "11px", fontWeight: 600,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  marginBottom: "6px",
                }}>
                  {entry.title ?? `Anime #${animeId}`}
                </div>

                {/* Progress bar */}
                <div style={{ height: "3px", background: "#1a1a1a", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${pct}%`,
                    background: "#3b82f6", borderRadius: "2px",
                    transition: "width 0.3s ease",
                  }} />
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}