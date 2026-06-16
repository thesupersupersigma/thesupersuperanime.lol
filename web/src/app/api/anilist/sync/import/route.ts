import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { importFromAniList } from "@/lib/anilist-sync";

export async function POST() {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    }

    const counts = await importFromAniList(user.id);
    return NextResponse.json(counts);
  } catch (error) {
    console.error("[AniList import] Failed:", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
