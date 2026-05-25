import { NextRequest, NextResponse } from "next/server";
import { searchAnime } from "@/lib/anilist";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q       = p.get("q")      || "";
  const genre   = p.get("genre")  || undefined;
  const season  = p.get("season") || undefined;
  const year    = p.get("year");
  const format  = p.get("format") || undefined;

  const hasFilters = !!(genre || season || year || format);

  if (!q.trim() && !hasFilters) {
    return NextResponse.json({ media: [] });
  }

  try {
    const media = await searchAnime(q, 1, 20, {
      genre,
      season,
      seasonYear: year ? parseInt(year, 10) : undefined,
      format,
    });
    return NextResponse.json({ media });
  } catch (error) {
    console.error("AniList search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
