"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { getDisplayTitle } from "@/lib/anilist";
import type { AnilistMedia } from "@/lib/anilist";
import type { WatchlistStatus } from "@/components/anime-card";

const WATCHLIST_COLORS: Record<WatchlistStatus, string> = {
  Watching:  "#3b82f6",
  Completed: "#22c55e",
  Planning:  "#a855f7",
  Dropped:   "#ef4444",
  Paused:    "#f59e0b",
};

interface RankedAnime {
  anime: AnilistMedia;
  voteCount: number;
  score: number; // composite
}

interface Props {
  ranked: RankedAnime[];
  genre: string;
  userVotedIds: number[];
  isLoggedIn: boolean;
}

export function GenreVoteList({ ranked, genre, userVotedIds, isLoggedIn }: Props) {
  // vote state: animeId → count
  const [voteCounts, setVoteCounts] = useState<Map<number, number>>(
    () => new Map(ranked.map(r => [r.anime.id, r.voteCount]))
  );
  const [voted, setVoted] = useState<Set<number>>(
    () => new Set(userVotedIds)
  );
  const [loading, setLoading] = useState<Set<number>>(new Set());

  // Watchlist badges
  const [watchlistMap, setWatchlistMap] = useState<Map<number, WatchlistStatus>>(new Map());
  useEffect(() => {
    fetch("/api/watchlist")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.entries?.length) return;
        const m = new Map<number, WatchlistStatus>();
        for (const e of d.entries) {
          if (e.status) m.set(Number(e.animeId), e.status as WatchlistStatus);
        }
        setWatchlistMap(m);
      })
      .catch(() => {});
  }, []);

  async function toggleVote(animeId: number) {
    if (!isLoggedIn || loading.has(animeId)) return;

    const hasVote = voted.has(animeId);
    setLoading(prev => new Set(prev).add(animeId));

    // Optimistic update
    setVoted(prev => {
      const next = new Set(prev);
      if (hasVote) next.delete(animeId);
      else next.add(animeId);
      return next;
    });
    setVoteCounts(prev => {
      const next = new Map(prev);
      next.set(animeId, (next.get(animeId) ?? 0) + (hasVote ? -1 : 1));
      return next;
    });

    try {
      const res = await fetch("/api/genre-votes", {
        method: hasVote ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId, genre }),
      });
      if (res.ok) {
        const data = await res.json();
        setVoteCounts(prev => new Map(prev).set(animeId, data.voteCount));
      } else {
        // Rollback
        setVoted(prev => {
          const next = new Set(prev);
          if (hasVote) next.add(animeId);
          else next.delete(animeId);
          return next;
        });
        setVoteCounts(prev => {
          const next = new Map(prev);
          next.set(animeId, (next.get(animeId) ?? 0) + (hasVote ? 1 : -1));
          return next;
        });
      }
    } catch {
      // Rollback silently
      setVoted(prev => {
        const next = new Set(prev);
        if (hasVote) next.add(animeId);
        else next.delete(animeId);
        return next;
      });
    } finally {
      setLoading(prev => {
        const next = new Set(prev);
        next.delete(animeId);
        return next;
      });
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {ranked.map((item, idx) => {
        const { anime } = item;
        const title = getDisplayTitle(anime.title);
        const votes = voteCounts.get(anime.id) ?? item.voteCount;
        const hasVoted = voted.has(anime.id);
        const isLoading = loading.has(anime.id);
        const wlStatus = watchlistMap.get(anime.id);

        return (
          <div
            key={anime.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              background: "#111",
              border: "1px solid #1f1f1f",
              borderRadius: "8px",
              padding: "12px",
              transition: "border-color 150ms ease",
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "#2a2a2a")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "#1f1f1f")}
          >
            {/* Rank number */}
            <span style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: "18px",
              fontWeight: 700,
              color: idx < 3 ? "#3b82f6" : "#444",
              minWidth: "28px",
              textAlign: "center",
              flexShrink: 0,
            }}>
              {idx + 1}
            </span>

            {/* Cover image */}
            <Link href={`/anime/${anime.id}`} style={{ flexShrink: 0, position: "relative" }}>
              <div style={{
                width: "56px",
                height: "80px",
                borderRadius: "4px",
                overflow: "hidden",
                border: "1px solid #2a2a2a",
                position: "relative",
                background: "#1a1a1a",
              }}>
                <Image
                  src={anime.coverImage.extraLarge || anime.coverImage.large}
                  alt={title}
                  fill
                  sizes="56px"
                  style={{ objectFit: "cover" }}
                />
                {wlStatus && (
                  <span style={{
                    position: "absolute",
                    top: "3px",
                    left: "3px",
                    background: WATCHLIST_COLORS[wlStatus],
                    color: "#fff",
                    fontSize: "8px",
                    fontWeight: 700,
                    padding: "1px 4px",
                    borderRadius: "2px",
                    lineHeight: "1.4",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}>
                    {wlStatus}
                  </span>
                )}
              </div>
            </Link>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link
                href={`/anime/${anime.id}`}
                style={{ textDecoration: "none" }}
              >
                <p style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#e5e5e5",
                  marginBottom: "4px",
                  lineHeight: "1.3",
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}>
                  {title}
                </p>
              </Link>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                {anime.averageScore && (
                  <span style={{
                    background: "#3b82f6",
                    color: "#fff",
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "1px 6px",
                    borderRadius: "3px",
                  }}>
                    ★ {(anime.averageScore / 10).toFixed(1)}
                  </span>
                )}
                {anime.format && (
                  <span style={{ color: "#555", fontSize: "11px" }}>{anime.format}</span>
                )}
                {anime.episodes && (
                  <span style={{ color: "#555", fontSize: "11px" }}>{anime.episodes} ep</span>
                )}
              </div>
            </div>

            {/* Vote button */}
            <button
              onClick={() => toggleVote(anime.id)}
              disabled={!isLoggedIn || isLoading}
              title={!isLoggedIn ? "Log in to vote" : hasVoted ? "Remove vote" : "Upvote"}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
                background: hasVoted ? "rgba(59,130,246,0.15)" : "transparent",
                border: `1px solid ${hasVoted ? "#3b82f6" : "#2a2a2a"}`,
                borderRadius: "6px",
                padding: "6px 10px",
                cursor: isLoggedIn ? (isLoading ? "wait" : "pointer") : "not-allowed",
                color: hasVoted ? "#3b82f6" : "#666",
                transition: "all 150ms ease",
                flexShrink: 0,
                minWidth: "44px",
              }}
              onMouseEnter={e => {
                if (isLoggedIn && !isLoading) {
                  e.currentTarget.style.borderColor = "#3b82f6";
                  e.currentTarget.style.color = "#3b82f6";
                }
              }}
              onMouseLeave={e => {
                if (!hasVoted) {
                  e.currentTarget.style.borderColor = "#2a2a2a";
                  e.currentTarget.style.color = "#666";
                }
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill={hasVoted ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
              <span style={{ fontSize: "11px", fontWeight: 600, lineHeight: 1 }}>
                {votes}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
