"use client";

import Link from "next/link";
import { getDisplayTitle } from "@/lib/anilist";
import type { AnilistMedia } from "@/lib/anilist";
import { useState } from "react";
import { NextEpisodeCountdown } from "@/components/next-episode-countdown";

export function WatchInfo({ anime, episodeNum }: { anime: AnilistMedia; episodeNum: number }) {
  const title = getDisplayTitle(anime.title);
  const score = anime.averageScore;
  const description = anime.description?.replace(/<[^>]*>/g, "") || null;
  const isLong = description ? description.length > 300 : false;
  const [open, setOpen] = useState(!isLong);

  return (
    <div style={{ marginTop: "24px", padding: "0 16px" }}>
      <h1 style={{
        fontFamily: "'Syne', sans-serif", fontSize: "24px",
        fontWeight: 700, color: "#e5e5e5", marginBottom: "8px",
      }}>
        {title}
      </h1>

      {/* Episode + score + genres */}
      <div style={{
        display: "flex", alignItems: "center", gap: "12px",
        marginBottom: "12px", flexWrap: "wrap",
      }}>
        <span style={{ fontSize: "14px", color: "#e5e5e5", fontWeight: 500 }}>
          Episode {episodeNum}
        </span>
        {score && (
          <span style={{
            background: "#3b82f6", color: "#fff",
            fontSize: "12px", fontWeight: 600,
            padding: "2px 8px", borderRadius: "4px",
          }}>
            {(score / 10).toFixed(1)}
          </span>
        )}
        {anime.genres.map(g => (
          <span key={g} style={{
            background: "#2a2a2a", color: "#888",
            fontSize: "11px", padding: "2px 8px", borderRadius: "4px",
          }}>
            {g}
          </span>
        ))}
      </div>

      {/* Next episode countdown — compact inline version */}
      {anime.nextAiringEpisode && (
        <div style={{ marginBottom: "14px" }}>
          <NextEpisodeCountdown
            episode={anime.nextAiringEpisode.episode}
            airingAt={anime.nextAiringEpisode.airingAt}
            compact
          />
        </div>
      )}

      {/* Description */}
      {description && (
        <div style={{ fontSize: "13px", lineHeight: "1.6", color: "#aaa", marginBottom: "16px" }}>
          <p style={{
            margin: 0,
            display: open ? "block" : "-webkit-box",
            WebkitLineClamp: open ? "unset" : 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {description}
          </p>
          {isLong && (
            <button
              onClick={() => setOpen(!open)}
              style={{
                background: "transparent", border: "none",
                color: "#3b82f6", fontSize: "12px",
                fontWeight: 500, cursor: "pointer",
                padding: 0, marginTop: "4px",
              }}
            >
              {open ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      <Link href={`/anime/${anime.id}`} style={{
        color: "#3b82f6", fontSize: "13px",
        textDecoration: "none", fontWeight: 500,
      }}>
        ← Back to anime page
      </Link>
    </div>
  );
}