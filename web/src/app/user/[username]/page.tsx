import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getAnimeById, getDisplayTitle } from "@/lib/anilist";
import { getUserAvatar, getUserDisplayName } from "@/lib/user-utils";

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

  const [historyAgg, watchlistRaw, recentHistoryRaw] = await Promise.all([
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
  ]);

  const totalEpisodes = historyAgg._count.episodeId;
  const totalMinutes = Math.floor((historyAgg._sum.duration ?? 0) / 60);
  const showsCompleted = watchlistRaw.filter(w => w.status === "Completed").length;

  // Collect all unique anime IDs we need metadata for
  const historyAnimeIds = [...new Set(recentHistoryRaw.map(h => h.animeId))];
  const watchlistAnimeIds = [...new Set(watchlistRaw.map(w => w.animeId))].filter(
    id => !historyAnimeIds.includes(id)
  );
  const allAnimeIds = [...historyAnimeIds, ...watchlistAnimeIds.slice(0, 40)];

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
          <div>
            <h1 style={{
              fontFamily: "'Syne', sans-serif", fontSize: "20px",
              fontWeight: 700, color: "#e5e5e5", letterSpacing: "-0.02em", marginBottom: "3px",
            }}>
              {getUserDisplayName(user)}
            </h1>
            <p style={{ color: "#555", fontSize: "12px" }}>Public profile</p>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
          {[
            { label: "Episodes Watched", value: totalEpisodes },
            { label: "Shows Completed", value: showsCompleted },
            { label: "Hours Watched", value: Math.floor(totalMinutes / 60) },
          ].map(stat => (
            <div key={stat.label} style={{
              background: "#111", border: "1px solid #2a2a2a",
              borderRadius: "12px", padding: "20px", textAlign: "center",
            }}>
              <div style={{
                fontFamily: "'Syne', sans-serif", fontSize: "28px",
                fontWeight: 700, color: "#e5e5e5", marginBottom: "4px",
              }}>
                {stat.value}
              </div>
              <div style={{ color: "#555", fontSize: "12px" }}>{stat.label}</div>
            </div>
          ))}
        </div>

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
