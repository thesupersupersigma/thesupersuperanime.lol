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

  // Fetch history and watchlist in parallel
  const [historyRaw, watchlistRaw] = await Promise.all([
    db.watchHistory.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    db.watchlist.findMany({
      where: { userId: user.id },
      orderBy: { addedAt: "desc" },
    }),
  ]);

  // Get unique anime IDs across both lists
  const allAnimeIds = [...new Set([
    ...historyRaw.map(h => h.animeId),
    ...watchlistRaw.map(w => w.animeId),
  ])];

  // Fetch AniList metadata for all IDs in parallel (cap at 20 to avoid hammering)
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
    <AccountDashboard
      user={{ id: user.id, email: user.email }}
      history={history}
      watchlist={watchlist}
      logOutAction={logOutAction}
    />
  );
}