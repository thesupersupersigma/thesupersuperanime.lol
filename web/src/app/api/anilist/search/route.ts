import { NextRequest, NextResponse } from "next/server";
import { searchAnime } from "@/lib/anilist";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");

  if (!q || !q.trim()) {
    return NextResponse.json({ media: [] });
  }

  try {
    const media = await searchAnime(q);
    return NextResponse.json({ media });
  } catch (error) {
    console.error("AniList search error:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
