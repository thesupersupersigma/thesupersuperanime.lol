import { NextRequest, NextResponse } from "next/server";
import { getEpisodeSchedule } from "@/lib/anilist";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ animeId: string }> }
) {
  try {
    const { animeId } = await params;
    const id = Number(animeId);

    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid anime ID" }, { status: 400 });
    }

    const data = await getEpisodeSchedule(id);

    return NextResponse.json(data);
  } catch (error) {
    console.error("[/api/episodes/[animeId]] Error fetching schedule:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
