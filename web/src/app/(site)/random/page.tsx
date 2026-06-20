import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ANILIST_GENRES } from "@/lib/genres";

export const dynamic = "force-dynamic";

const FALLBACK_ANIME_ID = 21; // One Piece

export default async function RandomPage() {
  const user = await getCurrentUser();

  let preferredGenres: string[] = [];
  if (user) {
    const votes = await db.genreVote.groupBy({
      by: ["genre"],
      where: { userId: user.id },
      _count: { genre: true },
      orderBy: { _count: { genre: "desc" } },
      take: 3,
    });
    preferredGenres = votes.map((v) => v.genre);
  }

  const genrePool = preferredGenres.length > 0 ? preferredGenres : [...ANILIST_GENRES];
  const genre = genrePool[Math.floor(Math.random() * genrePool.length)];

  let pickedId: number | null = null;
  try {
    const page = Math.floor(Math.random() * 3) + 1;
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: `query($genre: String, $page: Int) {
          Page(page: $page, perPage: 20) {
            media(genre: $genre, type: ANIME, isAdult: false, sort: POPULARITY_DESC) {
              id
            }
          }
        }`,
        variables: { genre, page },
      }),
      cache: "no-store",
    });
    const data = await res.json();
    const results = data?.data?.Page?.media ?? [];
    if (results.length > 0) {
      pickedId = results[Math.floor(Math.random() * results.length)].id;
    }
  } catch (err) {
    console.log("Random anime fetch failed:", err);
  }

  redirect(`/anime/${pickedId ?? FALLBACK_ANIME_ID}`);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "50vh", color: "#555", fontSize: "14px" }}>
      Finding something for you…
    </div>
  );
}
