export type TitleLang = 'english' | 'romaji' | 'native'
type Titles = { romaji: string | null; english: string | null; native: string | null }

export const titleLangOf = (v: string | undefined): TitleLang => (v === 'romaji' || v === 'native' ? v : 'english')

/** The title in the viewer's chosen language, falling back to whichever AniList has. */
export const titleOf = (t: Titles, lang: TitleLang = 'english') =>
  t[lang] ?? t.english ?? t.romaji ?? t.native ?? 'Untitled'
