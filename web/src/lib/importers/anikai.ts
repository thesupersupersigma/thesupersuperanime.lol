export type ImportStatus = 'Planning' | 'Watching' | 'Completed' | 'Dropped' | 'Paused'

export interface NormalizedEntry {
  anilistId: number
  title: string
  status: ImportStatus
  episodesWatched: number
  malId?: number
}

export type ImportFormat = 'json' | 'txt' | 'xml'

function extractAnilistId(url: string | undefined): number | null {
  if (!url) return null;
  const match = url.match(/anilist\.co\/anime\/(\d+)/)
  return match ? parseInt(match[1]) : null
}

// --- JSON parser ---
export function parseAniKaiJson(raw: string): NormalizedEntry[] {
  const data = JSON.parse(raw) as Record<string, { name: string; al: string }[]>
  const entries: NormalizedEntry[] = []

  for (const [status, items] of Object.entries(data)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const anilistId = extractAnilistId(item.al)
      if (!anilistId) continue
      entries.push({
        anilistId,
        title: item.name || "Unknown",
        status: status as ImportStatus,
        episodesWatched: 0, 
      })
    }
  }
  return entries
}

// --- TXT parser ---
export function parseAniKaiTxt(raw: string): NormalizedEntry[] {
  const entries: NormalizedEntry[] = []
  let currentStatus: ImportStatus = 'Planning'
  let currentTitle = ''

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('### ')) {
      currentStatus = trimmed.replace('### ', '') as ImportStatus
    } else if (trimmed.startsWith('# ')) {
      currentTitle = trimmed.replace('# ', '')
    } else if (trimmed.includes('anilist.co')) {
      const anilistId = extractAnilistId(trimmed)
      if (anilistId && currentTitle) {
        entries.push({ anilistId, title: currentTitle, status: currentStatus, episodesWatched: 0 })
        currentTitle = ''
      }
    }
  }
  return entries
}

// --- XML parser (Node Safe Regex) ---
export function parseAniKaiXml(raw: string): NormalizedEntry[] {
  const entries: NormalizedEntry[] = []
  const animeBlocks = raw.match(/<anime>[\s\S]*?<\/anime>/g) || []
  
  for (const block of animeBlocks) {
    const titleMatch = block.match(/<series_title><!\[CDATA\[(.*?)\]\]><\/series_title>/) || block.match(/<series_title>(.*?)<\/series_title>/)
    const statusMatch = block.match(/<my_status>(.*?)<\/my_status>/)
    const epsMatch = block.match(/<my_watched_episodes>(.*?)<\/my_watched_episodes>/)
    const malMatch = block.match(/<series_animedb_id>(.*?)<\/series_animedb_id>/)

    const title = titleMatch ? titleMatch[1].trim() : ''
    const status = statusMatch ? statusMatch[1].trim() as ImportStatus : 'Planning'
    const episodesWatched = epsMatch ? parseInt(epsMatch[1]) : 0
    const malId = malMatch ? parseInt(malMatch[1]) : 0

    if (title && malId) {
      entries.push({
        anilistId: 0, 
        title,
        status,
        episodesWatched,
        malId,
      })
    }
  }
  return entries
}

// --- Auto-detect format ---
export function parseAniKaiExport(raw: string): { entries: NormalizedEntry[]; format: ImportFormat; needsIdResolution: boolean } {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) return { entries: parseAniKaiJson(trimmed), format: 'json', needsIdResolution: false }
  if (trimmed.startsWith('<')) return { entries: parseAniKaiXml(trimmed), format: 'xml', needsIdResolution: true }
  return { entries: parseAniKaiTxt(trimmed), format: 'txt', needsIdResolution: false }
}

// --- MAL to AniList Resolver ---
const MAL_TO_AL_QUERY = `
  query ($malId: Int) {
    Media(idMal: $malId, type: ANIME) {
      id
      title { romaji }
    }
  }
`

export async function resolveMalIds(entries: NormalizedEntry[]): Promise<NormalizedEntry[]> {
  const resolved = await Promise.allSettled(
    entries.map(async (entry) => {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: MAL_TO_AL_QUERY, variables: { malId: entry.malId } }),
      })
      const { data } = await res.json()
      return {
        ...entry,
        anilistId: data?.Media?.id ?? 0,
        title: data?.Media?.title?.romaji ?? entry.title,
      }
    })
  )

  return resolved
    .filter((r) => r.status === 'fulfilled' && r.value.anilistId !== 0)
    .map((r) => (r as PromiseFulfilledResult<any>).value)
}