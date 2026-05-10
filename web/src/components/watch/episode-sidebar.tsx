"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

interface EpisodeSidebarProps {
  totalEpisodes: number | null;
  nextAiringEpisode?: number | null;
  currentEpisode: number;
  animeId: number;
}

export function EpisodeSidebar({ totalEpisodes, nextAiringEpisode, currentEpisode, animeId }: EpisodeSidebarProps) {
  const currentRef = useRef<HTMLAnchorElement>(null);

  const episodeCount = nextAiringEpisode ? nextAiringEpisode - 1 : (totalEpisodes || 0);
  const episodes = Array.from({ length: episodeCount }, (_, i) => i + 1);

  useEffect(() => {
    if (currentRef.current) {
      currentRef.current.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  }, [currentEpisode]);

  return (
    <div className="episode-sidebar flex md:flex-col overflow-x-auto md:overflow-y-auto md:max-h-full gap-2 p-4 md:p-0" style={{ scrollbarWidth: "thin" }}>
      {episodes.map((ep) => {
        const isCurrent = ep === currentEpisode;
        return (
          <Link
            key={ep}
            href={`/watch/${animeId}/${ep}`}
            ref={isCurrent ? currentRef : null}
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "12px 16px",
              background: isCurrent ? "#222" : "#1a1a1a",
              border: "1px solid",
              borderColor: isCurrent ? "#3b82f6" : "#2a2a2a",
              borderLeft: isCurrent ? "4px solid #3b82f6" : "1px solid #2a2a2a",
              borderRadius: "4px",
              minWidth: "140px",
              textDecoration: "none",
              transition: "border-color 0.2s"
            }}
            className="hover:border-blue-500 flex-shrink-0"
          >
            <span style={{ fontSize: "13px", color: isCurrent ? "#3b82f6" : "#888", fontWeight: 600, marginBottom: "4px" }}>
              Episode {ep}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
