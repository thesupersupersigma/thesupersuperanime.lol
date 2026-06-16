import { db } from "@/lib/db";

const ANILIST_URL = "https://graphql.anilist.co";

const SITE_TO_ANILIST_STATUS: Record<string, string> = {
  Watching: "CURRENT",
  Completed: "COMPLETED",
  Planning: "PLANNING",
  Paused: "PAUSED",
  Dropped: "DROPPED",
};

const ANILIST_TO_SITE_STATUS: Record<string, string> = {
  CURRENT: "Watching",
  COMPLETED: "Completed",
  PLANNING: "Planning",
  PAUSED: "Paused",
  DROPPED: "Dropped",
  REPEATING: "Watching",
};

export async function syncToAniList(
  userId: string,
  anilistMediaId: number,
  status: string
): Promise<void> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { anilistToken: true },
    });

    if (!user?.anilistToken) return;

    const anilistStatus = SITE_TO_ANILIST_STATUS[status];
    if (!anilistStatus) return;

    console.log(`[AniList sync] firing — userId=${userId} mediaId=${anilistMediaId} status=${anilistStatus}`);

    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${user.anilistToken}`,
      },
      body: JSON.stringify({
        query: `mutation ($mediaId: Int!, $status: MediaListStatus!) {
          SaveMediaListEntry(mediaId: $mediaId, status: $status) { id }
        }`,
        variables: { mediaId: anilistMediaId, status: anilistStatus },
      }),
    });

    const responseText = await res.text();
    console.log(`[AniList sync] status=${res.status} body=${responseText}`);

    if (!res.ok) {
      console.error("[AniList sync] API error:", res.status, responseText);
    }
  } catch (err) {
    console.error("[AniList sync] Error:", err);
  }
}

export async function importFromAniList(
  userId: string
): Promise<{ imported: number; skipped: number }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { anilistToken: true, anilistId: true },
  });

  if (!user?.anilistToken || !user.anilistId) {
    return { imported: 0, skipped: 0 };
  }

  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${user.anilistToken}`,
    },
    body: JSON.stringify({
      query: `query ($userId: Int) {
        MediaListCollection(userId: $userId, type: ANIME) {
          lists {
            entries {
              mediaId
              status
            }
          }
        }
      }`,
      variables: { userId: user.anilistId },
    }),
  });

  if (!res.ok) {
    throw new Error(`AniList API error: ${res.status}`);
  }

  const data = await res.json();
  const lists: { entries: { mediaId: number; status: string }[] }[] =
    data.data?.MediaListCollection?.lists ?? [];

  let imported = 0;
  let skipped = 0;

  for (const list of lists) {
    for (const entry of list.entries ?? []) {
      const siteStatus = ANILIST_TO_SITE_STATUS[entry.status];
      if (!siteStatus || !entry.mediaId) {
        skipped++;
        continue;
      }

      await db.watchlist.upsert({
        where: { userId_animeId: { userId, animeId: entry.mediaId } },
        update: { status: siteStatus },
        create: {
          userId,
          sessionId: userId,
          animeId: entry.mediaId,
          status: siteStatus,
        },
      });

      imported++;
    }
  }

  return { imported, skipped };
}
