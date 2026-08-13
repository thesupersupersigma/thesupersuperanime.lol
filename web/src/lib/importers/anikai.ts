import { errorInfo } from '@/lib/log-error'
export type ImportStatus = 'Planning' | 'Watching' | 'Completed' | 'Dropped' | 'Paused'

export interface NormalizedEntry {
  anilistId: number
  title: string
  status: ImportStatus
  episodesWatched: number
  malId?: number
}

export type ImportFormat = 'json' | 'txt' | 'xml'
export type ImportSource = 'anikai' | 'hianime' | 'unknown'

// Normalize status strings from any site to our internal format
function normalizeStatus(raw: string): ImportStatus {
  const s = raw.trim().toLowerCase()
  if (s === 'plan to watch' || s === 'planning') return 'Planning'
  if (s === 'watching' || s === 'currently watching') return 'Watching'
  if (s === 'completed' || s === 'complete') return 'Completed'
  if (s === 'dropped') return 'Dropped'
  if (s === 'on-hold' || s === 'paused' || s === 'on hold') return 'Paused'
  return 'Planning'
}

function extractAnilistId(url: string | undefined): number | null {
  if (!url) return null
  const match = url.match(/anilist\.co\/anime\/(\d+)/)
  return match ? parseInt(match[1]) : null
}

function extractMalId(url: string | undefined): number | null {
  if (!url) return null
  const match = url.match(/myanimelist\.net\/anime\/(\d+)/)
  return match ? parseInt(match[1]) : null
}

// ── JSON parsers ─────────────────────────────────────────────────────────────

// AniKai JSON: { "Planning": [{ name, mal, al }], ... }
function parseAniKaiJson(raw: string): NormalizedEntry[] {
  const data = JSON.parse(raw) as Record<string, { name: string; al: string }[]>
  const entries: NormalizedEntry[] = []
  for (const [status, items] of Object.entries(data)) {
    if (!Array.isArray(items)) continue
    for (const item of items) {
      const anilistId = extractAnilistId(item.al)
      if (!anilistId) continue
      entries.push({
        anilistId,
        title: item.name || 'Unknown',
        status: normalizeStatus(status),
        episodesWatched: 0,
      })
    }
  }
  return entries
}

// HiAnime JSON: { "Plan to Watch": [{ name, link, mal_id, watchListType }], ... }
function parseHiAnimeJson(raw: string): NormalizedEntry[] {
  const data = JSON.parse(raw) as Record<string, { name: string; link: string; mal_id: number }[]>
  const entries: NormalizedEntry[] = []
  for (const [status, items] of Object.entries(data)) {
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (!item.mal_id) continue
      entries.push({
        anilistId: 0,
        title: item.name || 'Unknown',
        status: normalizeStatus(status),
        episodesWatched: 0,
        malId: item.mal_id,
      })
    }
  }
  return entries
}

function detectJsonSource(raw: string): ImportSource {
  try {
    const data = JSON.parse(raw)
    const firstKey = Object.keys(data)[0]
    const firstItem = Array.isArray(data[firstKey]) ? data[firstKey][0] : null
    if (!firstItem) return 'unknown'
    // HiAnime items have mal_id as a number field, AniKai have al/mal as URL strings
    if (typeof firstItem.mal_id === 'number') return 'hianime'
    if (typeof firstItem.al === 'string') return 'anikai'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

// ── TXT parsers ──────────────────────────────────────────────────────────────

// AniKai TXT:
// ### Planning
// # Title
// https://myanimelist.net/anime/123
// https://anilist.co/anime/456
function parseAniKaiTxt(raw: string): NormalizedEntry[] {
  const entries: NormalizedEntry[] = []
  let currentStatus: ImportStatus = 'Planning'
  let currentTitle = ''

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('### ')) {
      currentStatus = normalizeStatus(trimmed.replace('### ', ''))
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

// HiAnime TXT:
// # Plan to Watch
// Title | https://myanimelist.net/anime/123
// # Completed
// Title | https://myanimelist.net/anime/456
function parseHiAnimeTxt(raw: string): NormalizedEntry[] {
  const entries: NormalizedEntry[] = []
  let currentStatus: ImportStatus = 'Planning'

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('# ')) {
      currentStatus = normalizeStatus(trimmed.replace('# ', ''))
      continue
    }

    // "Title | https://myanimelist.net/anime/123"
    if (trimmed.includes('|') && trimmed.includes('myanimelist.net')) {
      const [titlePart, urlPart] = trimmed.split('|').map(s => s.trim())
      const malId = extractMalId(urlPart)
      if (malId && titlePart) {
        entries.push({
          anilistId: 0,
          title: titlePart,
          status: currentStatus,
          episodesWatched: 0,
          malId,
        })
      }
    }
  }
  return entries
}

function detectTxtSource(raw: string): ImportSource {
  // AniKai uses ### for sections, HiAnime uses # for sections
  if (raw.includes('### ')) return 'anikai'
  // HiAnime TXT has "Title | https://myanimelist.net" pattern
  if (raw.includes('| https://myanimelist.net')) return 'hianime'
  return 'unknown'
}

// ── XML parser (shared — both sites use near-identical MAL XML format) ───────

function parseXml(raw: string): NormalizedEntry[] {
  const entries: NormalizedEntry[] = []
  const animeBlocks = raw.match(/<anime>[\s\S]*?<\/anime>/g) || []

  for (const block of animeBlocks) {
    const titleMatch =
      block.match(/<series_title><!\[CDATA\[(.*?)\]\]><\/series_title>/) ||
      block.match(/<series_title>(.*?)<\/series_title>/)
    const statusMatch = block.match(/<my_status>(.*?)<\/my_status>/)
    const epsMatch = block.match(/<my_watched_episodes>(.*?)<\/my_watched_episodes>/)
    const malMatch = block.match(/<series_animedb_id>(.*?)<\/series_animedb_id>/)

    const title = titleMatch?.[1]?.trim() ?? ''
    const status = normalizeStatus(statusMatch?.[1]?.trim() ?? 'Planning')
    const episodesWatched = epsMatch ? parseInt(epsMatch[1]) : 0
    const malId = malMatch ? parseInt(malMatch[1]) : 0

    if (title && malId) {
      entries.push({ anilistId: 0, title, status, episodesWatched, malId })
    }
  }
  return entries
}

// ── Auto-detect and parse ────────────────────────────────────────────────────

export function parseImportExport(raw: string): {
  entries: NormalizedEntry[]
  format: ImportFormat
  source: ImportSource
  needsIdResolution: boolean
} {
  const trimmed = raw.trim()

  if (trimmed.startsWith('<')) {
    return {
      entries: parseXml(trimmed),
      format: 'xml',
      source: 'unknown', // doesn't matter, both use same XML shape
      needsIdResolution: true,
    }
  }

  if (trimmed.startsWith('{')) {
    const source = detectJsonSource(trimmed)
    const entries = source === 'hianime'
      ? parseHiAnimeJson(trimmed)
      : parseAniKaiJson(trimmed)
    return {
      entries,
      format: 'json',
      source,
      needsIdResolution: source === 'hianime',
    }
  }

  // TXT
  const source = detectTxtSource(trimmed)
  const entries = source === 'hianime'
    ? parseHiAnimeTxt(trimmed)
    : parseAniKaiTxt(trimmed)
  return {
    entries,
    format: 'txt',
    source,
    needsIdResolution: source === 'hianime',
  }
}

// Keep old export name as alias so existing code doesn't break
export const parseAniKaiExport = parseImportExport

// ── MAL → AniList resolver ───────────────────────────────────────────────────

const MAL_TO_AL_QUERY = `
  query ($malId: Int) {
    Media(idMal: $malId, type: ANIME) {
      id
      title { romaji }
    }
  }
`

export async function resolveMalIds(entries: NormalizedEntry[]): Promise<NormalizedEntry[]> {
  // AniList rate limits to ~90 req/min — batch with small delay to be safe
  const results: NormalizedEntry[] = []
  const chunks = []
  for (let i = 0; i < entries.length; i += 20) {
    chunks.push(entries.slice(i, i + 20))
  }

  for (const chunk of chunks) {
    const resolved = await Promise.allSettled(
      chunk.map(async (entry) => {
        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: MAL_TO_AL_QUERY, variables: { malId: entry.malId } }),
        })
        // res.ok was never checked: a 429/5xx left `data` undefined, anilistId
        // fell back to 0, and the filter below discarded the entry -- making a
        // rate-limited batch indistinguishable from "no AniList match".
        if (!res.ok) {
          console.error('[import] MAL->AL resolve failed', {
            malId: entry.malId, title: entry.title, status: res.status,
          })
          return { ...entry, anilistId: 0 }
        }
        const { data } = await res.json()
        return {
          ...entry,
          anilistId: data?.Media?.id ?? 0,
          title: data?.Media?.title?.romaji ?? entry.title,
        }
      })
    )
    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i]
      if (r.status === 'rejected') {
        // r.reason was never read.
        console.error('[import] MAL->AL resolve failed', {
          malId: chunk[i]?.malId, title: chunk[i]?.title, ...errorInfo(r.reason),
        })
        continue
      }
      if (r.value.anilistId !== 0) results.push(r.value)
    }
    // Small pause between chunks to avoid rate limiting
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 700))
  }

  if (results.length < entries.length) {
    // The caller only ever saw the smaller count, with no signal that anything
    // was dropped or why.
    console.warn('[import] dropped entries during AniList resolution', {
      requested: entries.length,
      resolved: results.length,
      dropped: entries.length - results.length,
    })
  }

  return results
}