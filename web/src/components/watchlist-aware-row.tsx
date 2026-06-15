"use client";

import { useEffect, useState } from "react";
import { AnimeCard, type WatchlistStatus } from "./anime-card";
import type { AnilistMedia } from "@/lib/anilist";

interface WatchlistAwareRowProps {
  anime: AnilistMedia[];
  /** Show a small "Ep N in Xd Yh" countdown under the title using nextAiringEpisode */
  showAiringCountdown?: boolean;
}

export function WatchlistAwareRow({ anime, showAiringCountdown }: WatchlistAwareRowProps) {
  const [statusMap, setStatusMap] = useState<Map<number, WatchlistStatus>>(new Map());

  useEffect(() => {
    fetch("/api/watchlist")
      .then(r => {
        if (!r.ok) { console.warn("[WatchlistAwareRow] /api/watchlist responded", r.status); return null; }
        return r.json();
      })
      .then(d => {
        console.log("[WatchlistAwareRow] /api/watchlist raw response:", d);
        if (!d?.entries?.length) {
          console.log("[WatchlistAwareRow] No entries — entries:", d?.entries);
          return;
        }
        const m = new Map<number, WatchlistStatus>();
        for (const e of d.entries) {
          if (e.status) m.set(Number(e.animeId), e.status as WatchlistStatus);
        }
        console.log("[WatchlistAwareRow] Status map built:", Object.fromEntries(m));
        console.log("[WatchlistAwareRow] Anime IDs on screen:", anime.map(a => a.id));
        setStatusMap(m);
      })
      .catch(err => console.error("[WatchlistAwareRow] Fetch failed:", err));
  }, [anime]);

  return (
    <div className="scroll-row">
      {anime.map(a => (
        <div key={a.id} style={{ width: "160px", minWidth: "140px", flexShrink: 0 }}>
          <AnimeCard anime={a} watchlistStatus={statusMap.get(a.id)} showAiringCountdown={showAiringCountdown} />
        </div>
      ))}
    </div>
  );
}
