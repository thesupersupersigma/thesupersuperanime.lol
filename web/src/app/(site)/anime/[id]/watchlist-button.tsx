"use client";

import { useState } from "react";

interface WatchlistButtonProps {
  animeId: number;
  title: string;
}

export function WatchlistButton({ animeId, title }: WatchlistButtonProps) {
  const [added, setAdded] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setLoading(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: added ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId }),
      });

      if (res.ok) {
        setAdded(!added);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      aria-label={added ? `Remove ${title} from watchlist` : `Add ${title} to watchlist`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        background: added ? "#1a1a1a" : "#3b82f6",
        color: added ? "#888" : "#fff",
        border: added ? "1px solid #2a2a2a" : "1px solid #3b82f6",
        borderRadius: "6px",
        padding: "8px 16px",
        fontSize: "13px",
        fontWeight: 500,
        fontFamily: "'DM Sans', sans-serif",
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.6 : 1,
        transition: "all 150ms ease",
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={added ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
      {added ? "In Watchlist" : "Add to Watchlist"}
    </button>
  );
}
