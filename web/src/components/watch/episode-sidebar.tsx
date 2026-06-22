"use client";

import { useEffect, useState, startTransition } from "react";
import Link from "next/link";

interface EpisodeSidebarProps {
  totalEpisodes: number | null;
  nextAiringEpisode?: number | null;
  currentEpisode: number;
  animeId: number;
  coverImage: string;
}

interface StreamingEpisode {
  title: string;
  thumbnail: string;
}

interface EpisodeScheduleData {
  schedule: Record<number, number>;
  streamingEpisodes: StreamingEpisode[];
}

const PAGE_SIZE = 50;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatAirDate(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function EpisodeSidebar({ totalEpisodes, nextAiringEpisode, currentEpisode, animeId, coverImage }: EpisodeSidebarProps) {
  const episodeCount = nextAiringEpisode ? nextAiringEpisode - 1 : (totalEpisodes || 0);
  const totalPages = Math.ceil(episodeCount / PAGE_SIZE);

  // Start on the page that contains the current episode
  const currentPage = Math.ceil(currentEpisode / PAGE_SIZE);
  const [page, setPage] = useState(currentPage);

  const [scheduleData, setScheduleData] = useState<EpisodeScheduleData | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(true);

  // If episode changes (e.g. auto-advance), jump to its page
  useEffect(() => {
    startTransition(() => { setPage(Math.ceil(currentEpisode / PAGE_SIZE)); });
  }, [currentEpisode]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/episodes/${animeId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!cancelled && d) setScheduleData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingSchedule(false);
      });
    return () => { cancelled = true; };
  }, [animeId]);

  const startEp = (page - 1) * PAGE_SIZE + 1;
  const endEp = Math.min(page * PAGE_SIZE, episodeCount);
  const episodes = Array.from({ length: endEp - startEp + 1 }, (_, i) => startEp + i);

  if (episodeCount === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <style>{`
        @keyframes episodeRowPulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }
      `}</style>

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

      {/* Episode list */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        padding: "8px",
        overflowY: "auto",
        flex: 1,
        scrollbarWidth: "thin",
      }}>
        {loadingSchedule
          ? episodes.map(ep => (
              <div
                key={ep}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  height: "72px",
                  padding: "8px 12px",
                  background: "#1a1a1a",
                  borderRadius: "4px",
                  animation: "episodeRowPulse 2s ease-in-out infinite",
                }}
              >
                <div style={{ width: "112px", height: "63px", flexShrink: 0, background: "#262626", borderRadius: "4px" }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ width: "40%", height: "10px", background: "#262626", borderRadius: "3px" }} />
                  <div style={{ width: "70%", height: "10px", background: "#262626", borderRadius: "3px" }} />
                </div>
              </div>
            ))
          : episodes.map(ep => {
              const isCurrent = ep === currentEpisode;
              const streamingEp = scheduleData?.streamingEpisodes?.[ep - 1];
              const thumbnail = streamingEp?.thumbnail || coverImage;
              const airingAt = scheduleData?.schedule?.[ep];

              return (
                <Link
                  key={ep}
                  href={`/watch/${animeId}/${ep}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    height: "88px",
                    padding: "8px 12px",
                    background: isCurrent ? "#1e3a5f" : "transparent",
                    borderLeft: isCurrent ? "3px solid #3b82f6" : "3px solid transparent",
                    textDecoration: "none",
                    transition: "background 150ms ease",
                  }}
                  onMouseEnter={e => {
                    if (!isCurrent) {
                      (e.currentTarget as HTMLAnchorElement).style.background = "#1a1a1a";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isCurrent) {
                      (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                    }
                  }}
                >
                  <img
                    src={thumbnail}
                    alt={`Episode ${ep}`}
                    style={{
                      width: "112px",
                      height: "63px",
                      objectFit: "cover",
                      borderRadius: "4px",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: "2px", height: "100%" }}>
                    <div>
                      <div style={{ fontSize: "11px", color: "#888" }}>
                        Episode {ep}
                      </div>
                    </div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
                      {airingAt ? formatAirDate(airingAt) : ""}
                    </div>
                  </div>
                </Link>
              );
            })}
      </div>
    </div>
  );
}
