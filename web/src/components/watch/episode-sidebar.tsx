"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface EpisodeSidebarProps {
  totalEpisodes: number | null;
  nextAiringEpisode?: number | null;
  currentEpisode: number;
  animeId: number;
}

const PAGE_SIZE = 50;

export function EpisodeSidebar({ totalEpisodes, nextAiringEpisode, currentEpisode, animeId }: EpisodeSidebarProps) {
  const episodeCount = nextAiringEpisode ? nextAiringEpisode - 1 : (totalEpisodes || 0);
  const totalPages = Math.ceil(episodeCount / PAGE_SIZE);

  // Start on the page that contains the current episode
  const currentPage = Math.ceil(currentEpisode / PAGE_SIZE);
  const [page, setPage] = useState(currentPage);

  // If episode changes (e.g. auto-advance), jump to its page
  useEffect(() => {
    setPage(Math.ceil(currentEpisode / PAGE_SIZE));
  }, [currentEpisode]);

  const startEp = (page - 1) * PAGE_SIZE + 1;
  const endEp = Math.min(page * PAGE_SIZE, episodeCount);
  const episodes = Array.from({ length: endEp - startEp + 1 }, (_, i) => startEp + i);

  if (episodeCount === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Page range selector — only shown when there's more than one page */}
      {totalPages > 1 && (
        <div style={{
          padding: "10px 12px",
          borderBottom: "1px solid #1a1a1a",
          flexShrink: 0,
        }}>
          <select
            value={page}
            onChange={e => setPage(Number(e.target.value))}
            style={{
              width: "100%",
              background: "#1a1a1a",
              color: "#e5e5e5",
              border: "1px solid #2a2a2a",
              borderRadius: "6px",
              padding: "7px 10px",
              fontSize: "13px",
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
              outline: "none",
              appearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 10px center",
              paddingRight: "30px",
            }}
          >
            {Array.from({ length: totalPages }, (_, i) => {
              const rangeStart = i * PAGE_SIZE + 1;
              const rangeEnd = Math.min((i + 1) * PAGE_SIZE, episodeCount);
              return (
                <option key={i} value={i + 1} style={{ background: "#1a1a1a" }}>
                  Episodes {rangeStart}–{rangeEnd}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Episode grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "6px",
        padding: "12px",
        overflowY: "auto",
        flex: 1,
        scrollbarWidth: "thin",
        alignContent: "start",
      }}>
        {episodes.map((ep) => {
          const isCurrent = ep === currentEpisode;
          return (
            <Link
              key={ep}
              href={`/watch/${animeId}/${ep}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 4px",
                background: isCurrent ? "#1e3a5f" : "#1a1a1a",
                border: `1px solid ${isCurrent ? "#3b82f6" : "#2a2a2a"}`,
                borderRadius: "6px",
                textDecoration: "none",
                fontSize: "13px",
                fontWeight: isCurrent ? 700 : 500,
                color: isCurrent ? "#60a5fa" : "#a3a3a3",
                transition: "all 150ms ease",
                textAlign: "center",
                lineHeight: 1,
              }}
              onMouseEnter={e => {
                if (!isCurrent) {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = "#3b82f6";
                  (e.currentTarget as HTMLAnchorElement).style.color = "#e5e5e5";
                }
              }}
              onMouseLeave={e => {
                if (!isCurrent) {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = "#2a2a2a";
                  (e.currentTarget as HTMLAnchorElement).style.color = "#a3a3a3";
                }
              }}
            >
              {ep}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
