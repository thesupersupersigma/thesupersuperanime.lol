import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAnimeById, getDisplayTitle } from "@/lib/anilist";
import { getUserAvatar, getUserDisplayName } from "@/lib/user-utils";
import { BadgeCard } from "@/components/badges/BadgeCard";
import { FollowButton } from "./follow-button";

interface PageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  return { title: `${decodeURIComponent(username)} — thesupersuperanime` };
}

const STATUS_COLORS: Record<string, string> = {
  Watching: "#3b82f6",
  Completed: "#22c55e",
  Planning: "#a855f7",
  Dropped: "#ef4444",
  Paused: "#f59e0b",
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// GitHub-style heatmap color scale (episodes watched on a given day)
function heatColor(count: number): string {
  if (count <= 0) return "#1a1a1a";
  if (count <= 2) return "#1e3a5f";
  if (count <= 5) return "#1d4ed8";
  if (count <= 9) return "#2563eb";
  return "#60a5fa";
}

// Build a 53-column × 7-row (Mon–Sun) grid covering roughly the last 365 days.
// Columns are left→right oldest→newest weeks; rows top→bottom Mon→Sun.
function buildHeatmap(countsByDate: Map<string, number>) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const COLS = 53;

  // UTC midnight of today
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // Monday index of today (Mon=0 … Sun=6)
  const mondayIdx = (today.getUTCDay() + 6) % 7;
  // Monday of the current week
  const currentWeekMonday = new Date(today.getTime() - mondayIdx * DAY_MS);
  // Monday of the first (leftmost) column
  const firstMonday = new Date(currentWeekMonday.getTime() - (COLS - 1) * 7 * DAY_MS);

  const columns: { date: Date | null; count: number; isFuture: boolean; dateStr: string }[][] = [];
  const monthLabels: (string | null)[] = [];
  let prevMonth = -1;

  for (let c = 0; c < COLS; c++) {
    const col: { date: Date | null; count: number; isFuture: boolean; dateStr: string }[] = [];
    const colMonday = new Date(firstMonday.getTime() + c * 7 * DAY_MS);

    // Month label: show abbreviation at the column where a new month begins
    const colMonth = colMonday.getUTCMonth();
    if (colMonth !== prevMonth) {
      monthLabels.push(MONTH_NAMES[colMonth]);
      prevMonth = colMonth;
    } else {
      monthLabels.push(null);
    }

    for (let r = 0; r < 7; r++) {
      const date = new Date(colMonday.getTime() + r * DAY_MS);
      const isFuture = date.getTime() > today.getTime();
      const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
      col.push({
        date,
        count: countsByDate.get(dateStr) ?? 0,
        isFuture,
        dateStr,
      });
    }
    columns.push(col);
  }

  return { columns, monthLabels };
}

export default async function UserProfilePage({ params }: PageProps) {
  const { username } = await params;
  const decodedUsername = decodeURIComponent(username);

  // Look up by discordUsername first, then by custom email-user username
  const user = await db.user.findFirst({
    where: {
      OR: [
        { discordUsername: decodedUsername },
        { username: decodedUsername },
      ],
    },
    select: {
      id: true,
      discordUsername: true,
      discordAvatar: true,
      username: true,
      displayName: true,
      avatarPreset: true,
    },
  });

  if (!user) notFound();

  const viewer = await getCurrentUser();
  const viewerId = viewer?.id ?? null;
  const isOwnProfile = viewerId === user.id;

  const [
    historyAgg,
    watchlistRaw,
    recentHistoryRaw,
    badges,
    followersCount,
    followingCount,
    followRow,
    heatmapRows,
  ] = await Promise.all([
    db.watchHistory.aggregate({
      where: { userId: user.id },
      _count: { episodeId: true },
      _sum: { duration: true },
    }),
    db.watchlist.findMany({
      where: { userId: user.id },
      orderBy: { addedAt: "desc" },
    }),
    db.watchHistory.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    db.userBadge.findMany({
      where: { userId: user.id },
      include: { badge: true },
      orderBy: [{ badge: { rarityOrder: "desc" } }, { grantedAt: "asc" }],
    }),
    db.follow.count({ where: { followingId: user.id } }),
    db.follow.count({ where: { followerId: user.id } }),
    viewerId && !isOwnProfile
      ? db.follow.findUnique({
          where: { followerId_followingId: { followerId: viewerId, followingId: user.id } },
        })
      : Promise.resolve(null),
    db.watchHistory.findMany({
      where: {
        userId: user.id,
        updatedAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
      },
      select: { updatedAt: true },
      orderBy: { updatedAt: "asc" },
    }),
  ]);

  const isFollowing = Boolean(followRow);

  const totalEpisodes = historyAgg._count.episodeId;
  const totalMinutes = Math.floor((historyAgg._sum.duration ?? 0) / 60);
  const showsCompleted = watchlistRaw.filter(w => w.status === "Completed").length;

  // ── Favorite genre — tally GenreCache genres across completed anime ──────────
  const completedAnimeIds = watchlistRaw.filter(w => w.status === "Completed").map(w => w.animeId);
  let favoriteGenre = "—";
  if (completedAnimeIds.length > 0) {
    const genreRows = await db.genreCache.findMany({
      where: { animeId: { in: completedAnimeIds } },
      select: { genres: true },
    });
    const tally = new Map<string, number>();
    for (const row of genreRows) {
      for (const g of row.genres) {
        tally.set(g, (tally.get(g) ?? 0) + 1);
      }
    }
    let best = "";
    let bestCount = 0;
    for (const [genre, count] of tally) {
      if (count > bestCount) {
        best = genre;
        bestCount = count;
      }
    }
    if (best) favoriteGenre = best;
  }

  // ── Currently watching (max 6) ───────────────────────────────────────────────
  const currentlyWatchingRaw = watchlistRaw.filter(w => w.status === "Watching").slice(0, 6);

  // ── Heatmap counts grouped by UTC date string ────────────────────────────────
  const countsByDate = new Map<string, number>();
  for (const row of heatmapRows) {
    const dateStr = row.updatedAt.toISOString().slice(0, 10);
    countsByDate.set(dateStr, (countsByDate.get(dateStr) ?? 0) + 1);
  }
  const { columns: heatColumns, monthLabels } = buildHeatmap(countsByDate);

  // Collect all unique anime IDs we need metadata for
  const historyAnimeIds = [...new Set(recentHistoryRaw.map(h => h.animeId))];
  const currentlyWatchingIds = currentlyWatchingRaw.map(w => w.animeId);
  const watchlistAnimeIds = [...new Set(watchlistRaw.map(w => w.animeId))].filter(
    id => !historyAnimeIds.includes(id)
  );
  const allAnimeIds = [
    ...new Set([...historyAnimeIds, ...currentlyWatchingIds, ...watchlistAnimeIds.slice(0, 40)]),
  ];

  const metaResults = await Promise.allSettled(allAnimeIds.map(id => getAnimeById(id)));
  const metaMap = new Map<number, { title: string; cover: string }>();
  metaResults.forEach((result, i) => {
    if (result.status === "fulfilled" && result.value) {
      const anime = result.value;
      metaMap.set(allAnimeIds[i], {
        title: getDisplayTitle(anime.title),
        cover: anime.coverImage?.large ?? anime.coverImage?.medium ?? "",
      });
    }
  });

  const recentHistory = recentHistoryRaw.map(h => {
    const parts = h.episodeId.split("-");
    const epNum = parts[parts.length - 1];
    return {
      episodeId: h.episodeId,
      animeId: h.animeId,
      epNum,
      title: metaMap.get(h.animeId)?.title ?? `Anime #${h.animeId}`,
      cover: metaMap.get(h.animeId)?.cover ?? "",
    };
  });

  const currentlyWatching = currentlyWatchingRaw.map(w => ({
    animeId: w.animeId,
    title: metaMap.get(w.animeId)?.title ?? `Anime #${w.animeId}`,
    cover: metaMap.get(w.animeId)?.cover ?? "",
  }));

  const watchlist = watchlistRaw.map(w => ({
    animeId: w.animeId,
    status: w.status,
    title: metaMap.get(w.animeId)?.title ?? `Anime #${w.animeId}`,
    cover: metaMap.get(w.animeId)?.cover ?? "",
  }));

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0a", color: "#e5e5e5",
      paddingTop: "80px", paddingBottom: "80px",
      paddingLeft: "24px", paddingRight: "24px",
    }}>
      <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Back */}
        <Link
          href="/leaderboard"
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#555", fontSize: "13px", textDecoration: "none", width: "fit-content" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back to leaderboard
        </Link>

        {/* Profile header */}
        <div style={{
          background: "#111", border: "1px solid #2a2a2a",
          borderRadius: "16px", padding: "28px 32px",
          display: "flex", alignItems: "center", gap: "16px",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, width: "100%", height: "1px",
            background: "linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)",
          }} />
          <Image
            src={getUserAvatar(user)}
            alt={getUserDisplayName(user)}
            width={56} height={56}
            style={{ borderRadius: "50%", border: "2px solid #2a2a2a", flexShrink: 0, objectFit: "cover" }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              fontFamily: "'Syne', sans-serif", fontSize: "20px",
              fontWeight: 700, color: "#e5e5e5", letterSpacing: "-0.02em", marginBottom: "3px",
            }}>
              {getUserDisplayName(user)}
            </h1>
            <p style={{ color: "#555", fontSize: "12px" }}>
              Public profile · <span style={{ color: "#a3a3a3" }}>{followersCount}</span> follower{followersCount === 1 ? "" : "s"} · <span style={{ color: "#a3a3a3" }}>{followingCount}</span> following
            </p>
          </div>
          {viewerId && !isOwnProfile && (
            <FollowButton followingId={user.id} initialIsFollowing={isFollowing} viewerId={viewerId} />
          )}
        </div>

        {/* Currently Watching */}
        {currentlyWatching.length > 0 && (
          <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: "16px", overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #1a1a1a" }}>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5" }}>
                Currently Watching
              </h2>
            </div>
            <div style={{ padding: "16px 24px", display: "flex", gap: "10px", overflowX: "auto" }}>
              {currentlyWatching.map(entry => (
                <Link key={entry.animeId} href={`/anime/${entry.animeId}`} style={{ textDecoration: "none", flexShrink: 0, width: "90px" }}>
                  <div style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid #1a1a1a" }}>
                    {entry.cover ? (
                      <Image
                        src={entry.cover} alt={entry.title}
                        width={90} height={128}
                        style={{ width: "100%", height: "auto", display: "block", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{ width: "100%", paddingTop: "140%", background: "#1a1a1a" }} />
                    )}
                  </div>
                  <div style={{
                    color: "#a3a3a3", fontSize: "11px", fontWeight: 600, marginTop: "6px",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {entry.title}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          {[
            { label: "Episodes Watched", value: totalEpisodes },
            { label: "Shows Completed", value: showsCompleted },
            { label: "Hours Watched", value: Math.floor(totalMinutes / 60) },
            { label: "Favorite Genre", value: favoriteGenre },
          ].map(stat => (
            <div key={stat.label} style={{
              background: "#111", border: "1px solid #2a2a2a",
              borderRadius: "12px", padding: "20px", textAlign: "center",
            }}>
              <div style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: typeof stat.value === "string" ? "18px" : "28px",
                fontWeight: 700, color: "#e5e5e5", marginBottom: "4px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                lineHeight: typeof stat.value === "string" ? "1.9" : undefined,
              }}>
                {stat.value}
              </div>
              <div style={{ color: "#555", fontSize: "12px" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Watch Activity heatmap */}
        <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: "16px", overflow: "hidden" }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #1a1a1a" }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5" }}>
              Watch Activity
            </h2>
          </div>
          <div style={{ padding: "16px 24px", overflowX: "auto" }}>
            <div style={{ display: "inline-flex", flexDirection: "column", gap: "4px", minWidth: "min-content" }}>
              {/* Month labels */}
              <div style={{ display: "flex", gap: "2px", paddingLeft: "0px" }}>
                {monthLabels.map((label, i) => (
                  <div key={i} style={{ width: "12px", fontSize: "9px", color: "#555", position: "relative", height: "12px" }}>
                    {label && (
                      <span style={{ position: "absolute", left: 0, top: 0, whiteSpace: "nowrap" }}>{label}</span>
                    )}
                  </div>
                ))}
              </div>
              {/* Grid: columns of 7 days */}
              <div style={{ display: "flex", gap: "2px" }}>
                {heatColumns.map((col, c) => (
                  <div key={c} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {col.map((cell, r) => (
                      <div
                        key={r}
                        title={cell.isFuture ? undefined : `${cell.dateStr}: ${cell.count} episode${cell.count === 1 ? "" : "s"}`}
                        style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "2px",
                          background: cell.isFuture ? "transparent" : heatColor(cell.count),
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "6px", justifyContent: "flex-end" }}>
                <span style={{ fontSize: "10px", color: "#555" }}>Less</span>
                {["#1a1a1a", "#1e3a5f", "#1d4ed8", "#2563eb", "#60a5fa"].map(c => (
                  <div key={c} style={{ width: "12px", height: "12px", borderRadius: "2px", background: c }} />
                ))}
                <span style={{ fontSize: "10px", color: "#555" }}>More</span>
              </div>
            </div>
          </div>
        </div>

        {/* Badges */}
        {badges.length > 0 && (
          <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: "16px", overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #1a1a1a" }}>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5" }}>
                Badges
              </h2>
            </div>
            <div style={{ padding: "16px 24px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {badges.map((userBadge, i) => (
                <BadgeCard
                  key={userBadge.id}
                  slug={userBadge.badge.slug}
                  name={userBadge.badge.name}
                  description={userBadge.badge.description}
                  icon={userBadge.badge.icon}
                  rarity={userBadge.badge.rarity}
                  rarityOrder={userBadge.badge.rarityOrder}
                  grantedAt={userBadge.grantedAt.toISOString()}
                  context={userBadge.context}
                  index={i}
                />
              ))}
            </div>
          </div>
        )}

        {/* Recent history */}
        <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: "16px", overflow: "hidden" }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #1a1a1a" }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5" }}>
              Recently Watched
            </h2>
          </div>
          <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {recentHistory.length === 0 ? (
              <div style={{ padding: "32px 0", textAlign: "center", color: "#444", fontSize: "13px" }}>
                Nothing watched yet.
              </div>
            ) : (
              recentHistory.map(entry => (
                <Link
                  key={entry.episodeId}
                  href={`/watch/${entry.animeId}/${entry.epNum}`}
                  style={{
                    display: "flex", alignItems: "center", gap: "14px",
                    padding: "10px", borderRadius: "10px",
                    background: "#0f0f0f", border: "1px solid #1a1a1a",
                    textDecoration: "none",
                  }}
                >
                  {entry.cover ? (
                    <Image
                      src={entry.cover} alt={entry.title}
                      width={40} height={56}
                      style={{ borderRadius: "6px", objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{ width: 40, height: 56, borderRadius: "6px", background: "#1a1a1a", flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: "#e5e5e5", fontSize: "13px", fontWeight: 600,
                      marginBottom: "3px", whiteSpace: "nowrap",
                      overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {entry.title}
                    </div>
                    <div style={{ color: "#555", fontSize: "12px" }}>Episode {entry.epNum}</div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Watchlist */}
        {watchlist.length > 0 && (
          <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: "16px", overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #1a1a1a" }}>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5" }}>
                Watchlist
              </h2>
            </div>
            <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: "24px" }}>
              {(["Watching", "Planning", "Completed", "Paused", "Dropped"] as const).map(status => {
                const group = watchlist.filter(w => w.status === status);
                if (group.length === 0) return null;
                return (
                  <div key={status}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: STATUS_COLORS[status] ?? "#555" }} />
                      <span style={{
                        color: "#a3a3a3", fontSize: "12px", fontWeight: 600,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>
                        {status} ({group.length})
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "10px" }}>
                      {group.map(entry => (
                        <Link key={entry.animeId} href={`/anime/${entry.animeId}`} style={{ textDecoration: "none" }}>
                          <div style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid #1a1a1a" }}>
                            {entry.cover ? (
                              <Image
                                src={entry.cover} alt={entry.title}
                                width={120} height={170}
                                style={{ width: "100%", height: "auto", display: "block", objectFit: "cover" }}
                              />
                            ) : (
                              <div style={{ width: "100%", paddingTop: "140%", background: "#1a1a1a" }} />
                            )}
                            <div style={{ padding: "8px", background: "#0f0f0f" }}>
                              <div style={{
                                color: "#e5e5e5", fontSize: "11px", fontWeight: 600,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>
                                {entry.title}
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
