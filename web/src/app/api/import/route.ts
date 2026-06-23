import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseAniKaiExport, resolveMalIds } from '@/lib/importers/anikai'
import { getCurrentUser, getSessionId } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized. Please log in again.' }, { status: 401 })

    // Use a valid session ID from your auth helper to satisfy Prisma CUID requirements
    const validSessionId = await getSessionId();

    const { content } = await req.json() as { content: string }
    
    // Parse the file content using the helper
    const { entries, needsIdResolution } = parseAniKaiExport(content)

    if (entries.length === 0) {
      return NextResponse.json({ error: "No valid anime found in this file." }, { status: 400 })
    }

    // Bound the AniList resolution fan-out + bulk inserts before doing any work.
    if (entries.length > 5000) {
      return NextResponse.json({ error: "Import too large — max 5000 entries." }, { status: 400 })
    }

    // Resolve MAL IDs to AniList IDs if it's an XML file
    const resolved = needsIdResolution
      ? await resolveMalIds(entries)
      : entries

    const validEntries = resolved.filter(e => e.anilistId > 0)

    // 1. Bulk upsert watchlist
    await db.watchlist.createMany({
      data: validEntries.map(e => ({
        userId: user.id,
        sessionId: validSessionId,
        animeId: e.anilistId,
        status: e.status || "Planning",
      })),
      skipDuplicates: true, 
    })

    // 2. Bulk upsert watch history for entries with progress
    const withProgress = validEntries.filter(e => e.episodesWatched > 0)
    if (withProgress.length > 0) {
      await db.watchHistory.createMany({
        data: withProgress.map(e => ({
          userId: user.id,
          sessionId: validSessionId,
          animeId: e.anilistId,
          episodeId: String(e.episodesWatched), 
          progress: 1, 
        })),
        skipDuplicates: true,
      })
    }

    return NextResponse.json({
      success: true,
      imported: validEntries.length,
      withProgress: withProgress.length,
    })
    
  } catch (err: unknown) {
    console.error("\n--- IMPORT ERROR ---")
    console.error(err)
    console.error("--------------------\n")
    return NextResponse.json({ error: "Failed to import file." }, { status: 500 })
  }
}