import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'

/** SUB = filled whitesmoke, DUB = outlined (mockups). */
export function Badge({ kind = 'neutral', children }: { kind?: 'sub' | 'dub' | 'neutral'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center rounded-sm px-2 text-xs font-bold tracking-wide',
        kind === 'sub' && 'bg-fg text-bg',
        kind === 'dub' && 'border border-fg text-fg',
        kind === 'neutral' && 'bg-surface-3 text-fg-2',
      )}
    >
      {children}
    </span>
  )
}
