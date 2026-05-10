import { NextRequest, NextResponse } from "next/server";
import { getAnimeById } from "@/lib/anilist";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const animeId = parseInt(id, 10);

    if (isNaN(animeId)) {
      return NextResponse.json({ error: "Invalid anime ID" }, { status: 400 });
    }

    const anime = await getAnimeById(animeId);

    if (!anime) {
      return NextResponse.json({ error: "Anime not found" }, { status: 404 });
    }

    return NextResponse.json({ anime });
  } catch (error) {
    console.error("[/api/anilist/[id]] Error fetching anime:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
