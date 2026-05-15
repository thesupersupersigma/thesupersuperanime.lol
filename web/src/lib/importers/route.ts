import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseAniKaiExport, resolveMalIds } from '@/lib/importers/anikai'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { content } = await req.json() as { content: string }
    
    // Parse the file
    const { entries, needsIdResolution } = parseAniKaiExport(content)

    // Resolve IDs if it's an XML file
    const resolved = needsIdResolution
      ? await resolveMalIds(entries)
      : entries

    const validEntries = resolved.filter(e => e.anilistId > 0)

    // 1. Bulk upsert watchlist
    await db.watchlist.createMany({
      data: validEntries.map(e => ({
        userId: user.id,
        sessionId: "imported", // Fallback requirement
        animeId: e.anilistId,
        status: e.status,
      })),
      skipDuplicates: true, // Requires the @@unique([userId, animeId]) we added earlier!
    })

    // 2. Bulk upsert watch history for entries with progress (XML files)
    const withProgress = validEntries.filter(e => e.episodesWatched > 0)
    if (withProgress.length > 0) {
      await db.watchHistory.createMany({
        data: withProgress.map(e => ({
          userId: user.id,
          sessionId: "imported",
          animeId: e.anilistId,
          episodeId: String(e.episodesWatched), 
          progress: 1, // Mark as started/watched
        })),
        skipDuplicates: true,
      })
    }

    return NextResponse.json({
      success: true,
      imported: validEntries.length,
      withProgress: withProgress.length,
    })
  } catch (err: any) {
    console.error("[/api/import] Error:", err)
    return NextResponse.json({ error: err.message || "Failed to parse file." }, { status: 500 })
  }
}