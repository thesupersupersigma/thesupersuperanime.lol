import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAnimeById, getDisplayTitle } from "@/lib/anilist";

// Escape a value for safe inclusion in a CSV field.
function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// GET /api/export/watch-history — download the signed-in user's full watch history as CSV.
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    }

    const rows = await db.watchHistory.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });

    // Resolve titles for each unique anime (one bad ID shouldn't fail the export)
    const uniqueIds = [...new Set(rows.map(r => r.animeId))];
    const metaResults = await Promise.allSettled(uniqueIds.map(id => getAnimeById(id)));
    const titleMap = new Map<number, string>();
    metaResults.forEach((result, i) => {
      if (result.status === "fulfilled" && result.value) {
        titleMap.set(uniqueIds[i], getDisplayTitle(result.value.title));
      }
    });

    const header = "Anime Title,Anime ID,Episode,Progress (seconds),Duration (seconds),Last Watched";
    const lines = rows.map(row => {
      const parts = row.episodeId.split("-");
      const epNum = parts[parts.length - 1];
      const title = titleMap.get(row.animeId) ?? `Anime #${row.animeId}`;
      return [
        csvEscape(title),
        csvEscape(row.animeId),
        csvEscape(epNum),
        csvEscape(row.progress),
        csvEscape(row.duration),
        csvEscape(row.updatedAt.toISOString()),
      ].join(",");
    });

    const csv = [header, ...lines].join("\r\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="watch-history.csv"',
      },
    });
  } catch (error) {
    console.error("Failed to export watch history:", error);
    return NextResponse.json({ error: "Failed to export watch history" }, { status: 500 });
  }
}
