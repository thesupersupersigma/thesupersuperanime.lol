"use client";

import Link from "next/link";

interface EpisodeListProps {
  animeId: number;
  totalEpisodes: number | null;
  /** Next airing episode number (to show which episodes are available) */
  nextAiringEpisode?: number | null;
}

export function EpisodeList({
  animeId,
  totalEpisodes,
  nextAiringEpisode,
}: EpisodeListProps) {
  // Determine how many episodes to show
  const episodeCount = nextAiringEpisode
    ? nextAiringEpisode - 1
    : totalEpisodes;

  if (!episodeCount || episodeCount <= 0) {
    return (
      <div
        style={{
          padding: "24px",
          textAlign: "center",
          color: "#666",
          fontSize: "13px",
        }}
      >
        No episodes available yet
      </div>
    );
  }

  const episodes = Array.from({ length: episodeCount }, (_, i) => i + 1);

  return (
    <div
      style={{
        borderRadius: "4px",
        overflow: "hidden",
        border: "1px solid #2a2a2a",
      }}
    >
      {episodes.map((ep) => {
        const isEven = ep % 2 === 0;

        return (
          <EpisodeRow
            key={ep}
            ep={ep}
            animeId={animeId}
            isEven={isEven}
            isLast={ep === episodeCount}
          />
        );
      })}
    </div>
  );
}

function EpisodeRow({
  ep,
  animeId,
  isEven,
  isLast,
}: {
  ep: number;
  animeId: number;
  isEven: boolean;
  isLast: boolean;
}) {
  const bgColor = isEven ? "#1a1a1a" : "#161616";

  return (
    <Link
      href={`/watch/${animeId}/${ep}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "48px",
        padding: "0 16px",
        background: bgColor,
        textDecoration: "none",
        color: "#e5e5e5",
        fontSize: "13px",
        transition: "background 150ms ease",
        borderBottom: isLast ? "none" : "1px solid #1f1f1f",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#222";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = bgColor;
      }}
    >
      <span style={{ fontWeight: 500 }}>Episode {ep}</span>
      <span
        style={{
          color: "#3b82f6",
          fontSize: "12px",
          fontWeight: 500,
        }}
      >
        Watch →
      </span>
    </Link>
  );
}
