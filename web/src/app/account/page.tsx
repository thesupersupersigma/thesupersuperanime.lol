import { Suspense } from "react"; // 👈 Added the Suspense import here
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { logOutAction } from "./actions";
import { AccountDashboard } from "./account-dashboard";
import { db } from "@/lib/db";
import { getAnimeById, getDisplayTitle } from "@/lib/anilist";

export default async function AccountPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#e5e5e5",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}>
        <LoginForm />
      </div>
    );
  }

  // Fetch history, watchlist, and badges in parallel
  const [historyRaw, watchlistRaw, badges] = await Promise.all([
    db.watchHistory.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    db.watchlist.findMany({
      where: { userId: user.id },
      orderBy: { addedAt: "desc" },
    }),
    db.userBadge.findMany({
      where: { userId: user.id },
      include: { badge: true },
      orderBy: [{ badge: { rarityOrder: "desc" } }, { grantedAt: "asc" }],
    }),
  ]);

  const badgeList = badges.map(ub => ({
    slug: ub.badge.slug,
    name: ub.badge.name,
    description: ub.badge.description,
    icon: ub.badge.icon,
    rarity: ub.badge.rarity,
    rarityOrder: ub.badge.rarityOrder,
    grantedAt: ub.grantedAt.toISOString(),
    context: ub.context,
  }));

  // Get unique anime IDs across both lists
  const allAnimeIds = [...new Set([
    ...historyRaw.map(h => h.animeId),
    ...watchlistRaw.map(w => w.animeId),
  ])];

  // Fetch AniList metadata for all IDs in parallel (cap at 40 to avoid hammering)
  const metadataResults = await Promise.allSettled(
    allAnimeIds.slice(0, 40).map(id => getAnimeById(id))
  );

  const metaMap = new Map<number, { title: string; cover: string; id: number }>()
  metadataResults.forEach((result, i) => {
    if (result.status === "fulfilled" && result.value) {
      const anime = result.value
      metaMap.set(allAnimeIds[i], {
        id: anime.id,
        title: getDisplayTitle(anime.title),
        cover: anime.coverImage?.large ?? anime.coverImage?.medium ?? "",
      })
    }
  })

  // Enrich history
  const history = historyRaw.map(h => ({
    episodeId: h.episodeId,
    animeId: h.animeId,
    progress: h.progress,
    duration: h.duration,
    updatedAt: h.updatedAt.toISOString(),
    title: metaMap.get(h.animeId)?.title ?? `Anime #${h.animeId}`,
    cover: metaMap.get(h.animeId)?.cover ?? "",
  }))

  // Enrich watchlist
  const watchlist = watchlistRaw.map(w => ({
    animeId: w.animeId,
    status: w.status,
    addedAt: w.addedAt.toISOString(),
    title: metaMap.get(w.animeId)?.title ?? `Anime #${w.animeId}`,
    cover: metaMap.get(w.animeId)?.cover ?? "",
  }))

  return (
    // 👈 Wrapped the AccountDashboard inside Suspense here
    <Suspense fallback={null}>
      <AccountDashboard
        user={{
          id: user.id,
          email: user.email,
          discordId: user.discordId ?? null,
          discordUsername: user.discordUsername ?? null,
          discordAvatar: user.discordAvatar ?? null,
          avatarPreset: user.avatarPreset ?? null,
          username: user.username ?? null,
          displayName: user.displayName ?? null,
          anilistUsername: user.anilistUsername ?? null,
        }}
        notifPrefs={{
          emailNotifStreak: user.emailNotifStreak,
          emailNotifRanked: user.emailNotifRanked,
          emailNotifNewEpisode: user.emailNotifNewEpisode,
          emailNotifCompletion: user.emailNotifCompletion,
        }}
        history={history}
        watchlist={watchlist}
        badges={badgeList}
        logOutAction={logOutAction}
      />
    </Suspense>
  );
} 