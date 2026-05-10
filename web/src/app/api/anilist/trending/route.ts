import { NextResponse } from "next/server";
import { getTrending } from "@/lib/anilist";

export async function GET() {
  try {
    const media = await getTrending(1, 20);
    return NextResponse.json({ media });
  } catch (error) {
    console.error("AniList trending error:", error);
    return NextResponse.json(
      { error: "Failed to fetch trending" },
      { status: 500 }
    );
  }
}
