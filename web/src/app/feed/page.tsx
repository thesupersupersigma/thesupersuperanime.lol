import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAnimeById, getDisplayTitle } from "@/lib/anilist";
import { getUserAvatar, getUserDisplayName } from "@/lib/user-utils";

export const metadata: Metadata = {
  title: "Friends' Activity — thesupersuperanime",
};

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default async function FeedPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/account");

  // Who does this user follow?
  const following = await db.follow.findMany({
    where: { followerId: viewer.id },
    select: { followingId: true },
  });
  const followingIds = following.map(f => f.followingId);

  // Recent activity from followed users (last 7 days)
  const activity = followingIds.length
    ? await db.watchHistory.findMany({
        where: {
          userId: { in: followingIds },
          updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              discordUsername: true,
              discordAvatar: true,
              avatarPreset: true,
            },
          },
        },
      })
    : [];

  // Resolve anime metadata for all unique anime in the feed
  const uniqueIds = [...new Set(activity.map(a => a.animeId))];
  const metaResults = await Promise.allSettled(uniqueIds.map(id => getAnimeById(id)));
  const metaMap = new Map<number, { title: string; cover: string }>();
  metaResults.forEach((result, i) => {
    if (result.status === "fulfilled" && result.value) {
      const anime = result.value;
      metaMap.set(uniqueIds[i], {
        title: getDisplayTitle(anime.title),
        cover: anime.coverImage?.large ?? anime.coverImage?.medium ?? "",
      });
    }
  });

  const items = activity.map(a => {
    const parts = a.episodeId.split("-");
    const epNum = parts[parts.length - 1];
    const profileSlug = a.user?.username ?? a.user?.discordUsername ?? null;
    return {
      id: a.id,
      epNum,
      animeId: a.animeId,
      title: metaMap.get(a.animeId)?.title ?? `Anime #${a.animeId}`,
      cover: metaMap.get(a.animeId)?.cover ?? "",
      updatedAt: a.updatedAt,
      displayName: a.user ? getUserDisplayName(a.user) : "Anonymous",
      avatar: a.user ? getUserAvatar(a.user) : "/avatars/PP_1.png",
      profileSlug,
    };
  });

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0a", color: "#e5e5e5",
      paddingTop: "80px", paddingBottom: "80px",
      paddingLeft: "24px", paddingRight: "24px",
    }}>
      <div style={{ maxWidth: "640px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>

        <Link
          href="/"
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#555", fontSize: "13px", textDecoration: "none", width: "fit-content" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back to home
        </Link>

        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontSize: "22px",
          fontWeight: 700, color: "#e5e5e5", letterSpacing: "-0.02em",
        }}>
          Friends&apos; Activity
        </h1>

        {followingIds.length === 0 ? (
          <div style={{
            background: "#111", border: "1px solid #2a2a2a", borderRadius: "16px",
            padding: "48px 24px", textAlign: "center", color: "#555", fontSize: "13px", lineHeight: 1.7,
          }}>
            You&apos;re not following anyone yet.{" "}
            <Link href="/leaderboard" style={{ color: "#3b82f6", textDecoration: "none" }}>
              Find people on the leaderboard.
            </Link>
          </div>
        ) : items.length === 0 ? (
          <div style={{
            background: "#111", border: "1px solid #2a2a2a", borderRadius: "16px",
            padding: "48px 24px", textAlign: "center", color: "#555", fontSize: "13px",
          }}>
            No activity in the last 7 days.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {items.map(item => (
              <div
                key={item.id}
                style={{
                  display: "flex", alignItems: "center", gap: "12px",
                  background: "#111", border: "1px solid #2a2a2a", borderRadius: "12px",
                  padding: "12px 14px",
                }}
              >
                {item.profileSlug ? (
                  <Link href={`/user/${item.profileSlug}`} style={{ flexShrink: 0 }}>
                    <Image
                      src={item.avatar} alt={item.displayName}
                      width={36} height={36}
                      style={{ borderRadius: "50%", border: "1px solid #2a2a2a", objectFit: "cover" }}
                    />
                  </Link>
                ) : (
                  <Image
                    src={item.avatar} alt={item.displayName}
                    width={36} height={36}
                    style={{ borderRadius: "50%", border: "1px solid #2a2a2a", objectFit: "cover", flexShrink: 0 }}
                  />
                )}

                <div style={{ flex: 1, minWidth: 0, fontSize: "13px", lineHeight: 1.5 }}>
                  <div style={{ color: "#e5e5e5", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.profileSlug ? (
                      <Link href={`/user/${item.profileSlug}`} style={{ color: "#e5e5e5", fontWeight: 600, textDecoration: "none" }}>
                        {item.displayName}
                      </Link>
                    ) : (
                      <span style={{ fontWeight: 600 }}>{item.displayName}</span>
                    )}
                    {" watched "}
                    <Link href={`/watch/${item.animeId}/${item.epNum}`} style={{ color: "#3b82f6", textDecoration: "none" }}>
                      Episode {item.epNum}
                    </Link>
                    {" of "}
                    <Link href={`/anime/${item.animeId}`} style={{ color: "#a3a3a3", textDecoration: "none" }}>
                      {item.title}
                    </Link>
                  </div>
                  <div style={{ color: "#555", fontSize: "12px", marginTop: "2px" }}>
                    {timeAgo(item.updatedAt)}
                  </div>
                </div>

                {item.cover && (
                  <Link href={`/anime/${item.animeId}`} style={{ flexShrink: 0 }}>
                    <Image
                      src={item.cover} alt={item.title}
                      width={32} height={45}
                      style={{ borderRadius: "4px", objectFit: "cover" }}
                    />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
