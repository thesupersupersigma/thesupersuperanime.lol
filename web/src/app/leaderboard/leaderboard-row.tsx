"use client";

import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";
import type { LeaderboardEntry } from "./page";
import { getUserAvatar, getUserDisplayName } from "@/lib/user-utils";

function formatWatchTime(minutes: number): string {
  if (minutes < 1) return "< 1 min";
  return `${minutes} mins`;
}

interface Props {
  entry: LeaderboardEntry;
  isLast: boolean;
  rankNode: ReactNode;
}

export default function LeaderboardRow({ entry, isLast, rankNode }: Props) {
  const rowStyle = {
    display: "grid",
    gridTemplateColumns: "48px 1fr 80px 80px 80px",
    gap: "12px", padding: "14px 20px",
    alignItems: "center",
    borderBottom: isLast ? "none" : "1px solid #0f0f0f",
    transition: "background 0.15s",
    textDecoration: "none",
    color: "inherit",
  } as const;

  const inner = (
    <>
      <div style={{ display: "flex", justifyContent: "center" }}>
        {rankNode}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
        <Image
          src={getUserAvatar(entry)}
          alt={getUserDisplayName(entry)}
          width={32} height={32}
          style={{ borderRadius: "50%", flexShrink: 0, objectFit: "cover" }}
        />
        <div style={{
          color: "#e5e5e5", fontSize: "13px", fontWeight: 500,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {getUserDisplayName(entry)}
        </div>
      </div>

      <div style={{ color: "#3b82f6", fontSize: "13px", fontWeight: 600, textAlign: "right" }}>
        {entry.episodesWatched}
      </div>
      <div style={{ color: "#a3a3a3", fontSize: "13px", textAlign: "right" }}>
        {entry.showsCompleted}
      </div>
      <div style={{ color: "#a3a3a3", fontSize: "13px", textAlign: "right" }}>
        {formatWatchTime(entry.minutesWatched)}
      </div>
    </>
  );

  // Link to profile if they have a Discord username or a custom username
  const profileSlug = entry.discordUsername ?? entry.username;
  if (profileSlug) {
    return (
      <Link
        href={`/user/${encodeURIComponent(profileSlug)}`}
        style={rowStyle}
        onMouseEnter={e => (e.currentTarget.style.background = "#0f0f0f")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div
      style={rowStyle}
      onMouseEnter={e => (e.currentTarget.style.background = "#0f0f0f")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {inner}
    </div>
  );
}
