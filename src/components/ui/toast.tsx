'use client'
import { Toast as T } from 'radix-ui'
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react'

type Item = { id: number; text: string; undo?: () => void }
const Ctx = createContext<(t: Omit<Item, 'id'>) => void>(() => {})

/** `const toast = useToast(); toast({ text: 'Removed', undo: () => … })` */
export const useToast = () => useContext(Ctx)

let seq = 0
// Long enough to reach Undo, short enough to get out of the way.
const DURATION_MS = 5000

export function Toaster({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const push = useCallback((t: Omit<Item, 'id'>) => setItems((xs) => [...xs.slice(-2), { ...t, id: ++seq }]), [])
  const drop = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id))
  return (
    <Ctx value={push}>
      <T.Provider swipeDirection="down" duration={DURATION_MS}>
        {children}
        {items.map((t) => (
          <T.Root
            key={t.id}
            onOpenChange={(open) => !open && drop(t.id)}
            className="flex animate-pop items-center gap-3.5 rounded-lg bg-fg py-2.5 pr-2.5 pl-4.5 font-semibold text-bg shadow-toast"
          >
            <T.Description>{t.text}</T.Description>
            {t.undo && (
              <T.Action
                altText="Undo"
                onClick={t.undo}
                className="min-h-11 rounded-sm border border-bg px-3 font-bold transition-colors duration-hover hover:bg-bg hover:text-fg"
              >
                Undo
              </T.Action>
            )}
          </T.Root>
        ))}
        <T.Viewport className="fixed bottom-7 left-1/2 z-50 flex w-max max-w-[92vw] -translate-x-1/2 flex-col gap-2 outline-none" />
      </T.Provider>
    </Ctx>
  )
}
