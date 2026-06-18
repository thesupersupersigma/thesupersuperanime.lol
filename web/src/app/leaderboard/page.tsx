"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import LeaderboardRow from "./leaderboard-row";
import { getUserAvatar, getUserDisplayName } from "@/lib/user-utils";

export interface LeaderboardEntry {
  userId: string;
  discordUsername: string | null;
  discordAvatar: string | null;
  username: string | null;
  displayName: string | null;
  avatarPreset: number | null;
  episodesWatched: number;
  showsCompleted: number;
  minutesWatched: number;
}

type Timeframe = "daily" | "weekly" | "monthly" | "alltime";

const TABS: { key: Timeframe; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "alltime", label: "All Time" },
];

function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ fontSize: "20px" }}>🥇</span>;
  if (rank === 2) return <span style={{ fontSize: "20px" }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: "20px" }}>🥉</span>;
  return (
    <span style={{
      width: "28px", textAlign: "center",
      color: "#555", fontSize: "13px", fontWeight: 600,
    }}>
      {rank}
    </span>
  );
}

export default function LeaderboardPage() {
  const [timeframe, setTimeframe] = useState<Timeframe>("alltime");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leaderboard?timeframe=${timeframe}`)
      .then(res => res.json())
      .then((data: LeaderboardEntry[]) => {
        if (cancelled) return;
        setEntries(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [timeframe]);

  function selectTimeframe(next: Timeframe) {
    if (next === timeframe) return;
    setLoading(true);
    setTimeframe(next);
  }

  // Top 3 get the podium cards; everyone else fills the table below, so no user
  // appears twice. Podium is laid out 2 · 1 · 3 (winner center stage). If there
  // aren't 3 users yet, skip the podium and list everyone in the table.
  const top3 = entries.slice(0, 3);
  const hasPodium = entries.length >= 3;
  const podium = hasPodium
    ? [
        { entry: top3[1], rank: 2 },
        { entry: top3[0], rank: 1 },
        { entry: top3[2], rank: 3 },
      ]
    : [];
  const listEntries = hasPodium ? entries.slice(3) : entries;
  const listStartIndex = hasPodium ? 3 : 0;

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "0 24px 80px" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "28px", fontWeight: 700,
          color: "#e5e5e5", letterSpacing: "-0.02em",
          marginBottom: "8px",
        }}>
          Leaderboard
        </h1>
        <p style={{ color: "#555", fontSize: "13px" }}>
          Top watchers — updates live
        </p>
      </div>

      {/* Timeframe tabs */}
      <div style={{
        display: "flex", gap: "24px",
        borderBottom: "1px solid #1a1a1a", marginBottom: "24px",
      }}>
        {TABS.map(tab => {
          const active = timeframe === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => selectTimeframe(tab.key)}
              style={{
                background: "none",
                border: "none",
                borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent",
                marginBottom: "-1px",
                padding: "8px 0",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "14px", fontWeight: 600,
                color: active ? "#3b82f6" : "#555",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Stats cards for top 3 — laid out 2 · 1 · 3, each linking to the profile */}
      {!loading && hasPodium && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: "12px", marginBottom: "32px",
        }}>
          {podium.map(({ entry, rank }) => {
            const cardStyle = {
              background: "#111", border: "1px solid #2a2a2a",
              borderRadius: "16px", padding: "20px",
              textAlign: "center", position: "relative", overflow: "hidden",
              display: "block", textDecoration: "none", color: "inherit",
            } as const;
            const accent = rank === 1
              ? "linear-gradient(to right, transparent, rgba(255,215,0,0.5), transparent)"
              : rank === 2
              ? "linear-gradient(to right, transparent, rgba(192,192,192,0.5), transparent)"
              : "linear-gradient(to right, transparent, rgba(205,127,50,0.5), transparent)";
            const card = (
              <>
                <div style={{
                  position: "absolute", top: 0, left: 0, width: "100%", height: "1px",
                  background: accent,
                }} />
                <Image
                  src={getUserAvatar(entry)}
                  alt={getUserDisplayName(entry)}
                  width={48} height={48}
                  style={{ borderRadius: "50%", margin: "0 auto 10px", objectFit: "cover" }}
                />
                <Medal rank={rank} />
                <div style={{
                  fontFamily: "'Syne', sans-serif",
                  fontSize: "13px", fontWeight: 600,
                  color: "#e5e5e5", marginTop: "6px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {getUserDisplayName(entry)}
                </div>
                <div style={{ color: "#3b82f6", fontSize: "20px", fontWeight: 700, marginTop: "8px" }}>
                  {entry.episodesWatched}
                </div>
                <div style={{ color: "#555", fontSize: "11px" }}>episodes</div>
                <div style={{ color: "#a3a3a3", fontSize: "12px", marginTop: "8px" }}>
                  {entry.minutesWatched} mins watched
                </div>
              </>
            );
            const profileSlug = entry.discordUsername ?? entry.username;
            return profileSlug ? (
              <Link key={entry.userId} href={`/user/${encodeURIComponent(profileSlug)}`} style={cardStyle}>
                {card}
              </Link>
            ) : (
              <div key={entry.userId} style={cardStyle}>
                {card}
              </div>
            );
          })}
        </div>
      )}

      {/* Full table — hidden entirely once the podium covers everyone */}
      {(listEntries.length > 0 || !hasPodium) && (
        <div style={{
          background: "#111", border: "1px solid #2a2a2a",
          borderRadius: "16px", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "48px 1fr 80px 80px 80px",
            gap: "12px", padding: "12px 20px",
            borderBottom: "1px solid #1a1a1a",
            color: "#444", fontSize: "11px",
            fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            <div>#</div>
            <div>User</div>
            <div style={{ textAlign: "right" }}>Episodes</div>
            <div style={{ textAlign: "right" }}>Completed</div>
            <div style={{ textAlign: "right" }}>Mins Watched</div>
          </div>

          {loading ? (
            // Skeleton rows — same height as real rows, no content
            Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: "60px",
                  background: "#1a1a1a",
                  borderBottom: i === 9 ? "none" : "1px solid #0f0f0f",
                }}
              />
            ))
          ) : listEntries.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", color: "#444", fontSize: "13px" }}>
              No data yet — start watching!
            </div>
          ) : (
            listEntries.map((entry, i) => (
              <LeaderboardRow
                key={entry.userId}
                entry={entry}
                isLast={i === listEntries.length - 1}
                rankNode={<Medal rank={listStartIndex + i + 1} />}
              />
            ))
          )}
        </div>
      )}

      <div style={{ marginTop: "16px", textAlign: "center" }}>
        <Link href="/" style={{ color: "#555", fontSize: "12px", textDecoration: "none" }}>
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
