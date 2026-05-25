import { db } from "@/lib/db";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import LeaderboardRow from "./leaderboard-row";

export const metadata: Metadata = {
  title: "Leaderboard — thesupersuperanime",
};

export const revalidate = 3600; // rebuild hourly

export interface LeaderboardEntry {
  userId: string;
  discordUsername: string | null;
  discordAvatar: string | null;
  episodesWatched: number;
  showsCompleted: number;
  minutesWatched: number;
}

async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  // Aggregate watch history by user
  const history = await db.watchHistory.groupBy({
    by: ["userId"],
    where: { userId: { not: null } },
    _count: { episodeId: true },
    _sum: { watchedSeconds: true },
    orderBy: { _count: { episodeId: "desc" } },
    take: 50,
  });

  // Get completed shows per user
  const completedCounts = await db.watchlist.groupBy({
    by: ["userId"],
    where: { userId: { not: null }, status: "Completed" },
    _count: { animeId: true },
  });

  const completedMap = new Map(
    completedCounts.map(c => [c.userId, c._count.animeId])
  );

  // Fetch user details
  const userIds = history
    .map(h => h.userId)
    .filter(Boolean) as string[];

  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, discordUsername: true, discordAvatar: true },
  });

  const userMap = new Map(users.map(u => [u.id, u]));

  return history
    .filter(h => h.userId && userMap.has(h.userId!))
    .map(h => {
      const user = userMap.get(h.userId!)!;
      return {
        userId: h.userId!,
        discordUsername: user.discordUsername,
        discordAvatar: user.discordAvatar,
        episodesWatched: h._count.episodeId,
        showsCompleted: completedMap.get(h.userId!) ?? 0,
        minutesWatched: Math.floor((h._sum.watchedSeconds ?? 0) / 60),
      };
    });
}

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

export default async function LeaderboardPage() {
  const entries = await getLeaderboard();

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
          Top watchers — updated hourly
        </p>
      </div>

      {/* Stats cards for top 3 */}
      {entries.length >= 3 && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: "12px", marginBottom: "32px",
        }}>
          {entries.slice(0, 3).map((entry, i) => (
            <div key={entry.userId} style={{
              background: "#111", border: "1px solid #2a2a2a",
              borderRadius: "16px", padding: "20px",
              textAlign: "center", position: "relative", overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: 0, left: 0, width: "100%", height: "1px",
                background: i === 0
                  ? "linear-gradient(to right, transparent, rgba(255,215,0,0.5), transparent)"
                  : i === 1
                  ? "linear-gradient(to right, transparent, rgba(192,192,192,0.5), transparent)"
                  : "linear-gradient(to right, transparent, rgba(205,127,50,0.5), transparent)",
              }} />
              {entry.discordAvatar ? (
                <Image
                  src={entry.discordAvatar}
                  alt={entry.discordUsername ?? ""}
                  width={48} height={48}
                  style={{ borderRadius: "50%", margin: "0 auto 10px" }}
                />
              ) : (
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "#1a1a1a", margin: "0 auto 10px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "18px", fontWeight: 700, color: "#3b82f6",
                }}>
                  {(entry.discordUsername ?? "?")[0].toUpperCase()}
                </div>
              )}
              <Medal rank={i + 1} />
              <div style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: "13px", fontWeight: 600,
                color: "#e5e5e5", marginTop: "6px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {entry.discordUsername ?? "Anonymous"}
              </div>
              <div style={{ color: "#3b82f6", fontSize: "20px", fontWeight: 700, marginTop: "8px" }}>
                {entry.episodesWatched}
              </div>
              <div style={{ color: "#555", fontSize: "11px" }}>episodes</div>
            </div>
          ))}
        </div>
      )}

      {/* Full table */}
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

        {entries.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#444", fontSize: "13px" }}>
            No data yet — start watching!
          </div>
        ) : (
          entries.map((entry, i) => (
            <LeaderboardRow 
              key={entry.userId} 
              entry={entry} 
              isLast={i === entries.length - 1} 
              rankNode={<Medal rank={i + 1} />} 
            />
          ))
        )}
      </div>

      <div style={{ marginTop: "16px", textAlign: "center" }}>
        <Link href="/" style={{ color: "#555", fontSize: "12px", textDecoration: "none" }}>
          ← Back to home
        </Link>
      </div>
    </div>
  );
}