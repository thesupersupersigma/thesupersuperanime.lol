"use client";

import Link from "next/link";
import { ANILIST_GENRES, GENRE_COLORS, GENRE_DESCRIPTIONS } from "@/lib/genres";

export function GenreGrid() {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
      gap: "12px",
    }}>
      {ANILIST_GENRES.map(genre => {
        const color = GENRE_COLORS[genre] ?? "#3b82f6";
        const description = GENRE_DESCRIPTIONS[genre] ?? "";

        return (
          <Link
            key={genre}
            href={`/genres/${encodeURIComponent(genre)}`}
            style={{
              display: "block",
              background: "#111",
              border: "1px solid #1f1f1f",
              borderRadius: "10px",
              padding: "16px",
              textDecoration: "none",
              transition: "border-color 150ms ease, background 150ms ease",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = color;
              e.currentTarget.style.background = "#151515";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "#1f1f1f";
              e.currentTarget.style.background = "#111";
            }}
          >
            {/* Color accent bar */}
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "3px",
              background: color,
              borderRadius: "10px 10px 0 0",
            }} />

            <p style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: "15px",
              fontWeight: 700,
              color: "#e5e5e5",
              marginBottom: "6px",
              letterSpacing: "-0.01em",
            }}>
              {genre}
            </p>

            <p style={{
              fontSize: "12px",
              color: "#555",
              lineHeight: "1.5",
              margin: 0,
            }}>
              {description}
            </p>

            {/* Arrow */}
            <div style={{
              position: "absolute",
              bottom: "14px",
              right: "14px",
              color: "#333",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
