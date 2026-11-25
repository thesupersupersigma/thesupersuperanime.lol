'use client'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { saveListEntry } from '@/app/actions'
import { type ListItem, type Progress, readGuest, writeGuest } from '@/lib/guest'

export type ListStatus = ListItem['status']
type State = {
  signedIn: boolean
  progress: Progress[]
  list: ListItem | null
  /** status null removes the entry; resolves false when the save failed */
  setList: (status: ListStatus | null, score: number | null) => Promise<boolean>
  putProgress: (row: Progress) => void
}
const Ctx = createContext<State | null>(null)

export function useUserAnime() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useUserAnime outside UserAnimeProvider')
  return s
}

/** Progress + list entry for one anime: from the account when signed in, else from this browser's guest storage. */
export function UserAnimeProvider({
  anilistId,
  signedIn,
  initial,
  children,
}: {
  anilistId: number
  signedIn: boolean
  initial: { progress: Progress[]; list: ListItem | null }
  children: ReactNode
}) {
  const [progress, setProgress] = useState(initial.progress)
  const [list, setListState] = useState(initial.list)

  useEffect(() => {
    if (signedIn) return
    const g = readGuest()
    setProgress(g.progress.filter((p) => p.anilistId === anilistId))
    setListState(g.list.find((l) => l.anilistId === anilistId) ?? null)
  }, [signedIn, anilistId])

  const setList = useCallback(
    async (status: ListStatus | null, score: number | null) => {
      const before = list
      const next = status && { anilistId, status, score, updatedAt: new Date().toISOString() }
      setListState(next)
      try {
        if (signedIn) {
          const r = await saveListEntry({ anilistId, status, score })
          if (!r.ok) throw new Error('signed out')
        } else {
          const g = readGuest()
          const rest = g.list.filter((l) => l.anilistId !== anilistId)
          writeGuest({ ...g, list: next ? [next, ...rest] : rest })
        }
        return true
      } catch {
        setListState(before)
        return false
      }
    },
    [anilistId, signedIn, list],
  )

  // the player saves rows itself; this only keeps lists on the page in step
  const putProgress = useCallback((row: Progress) => {
    setProgress((xs) => {
      const old = xs.find((p) => p.episode === row.episode)
      return [{ ...row, completed: row.completed || !!old?.completed }, ...xs.filter((p) => p !== old)]
    })
  }, [])

  return <Ctx value={{ signedIn, progress, list, setList, putProgress }}>{children}</Ctx>
}
