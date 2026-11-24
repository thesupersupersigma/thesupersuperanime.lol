'use client'
import { Avatar as A } from 'radix-ui'
import { cx } from '@/lib/cx'

export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return (
    <A.Root className={cx('inline-flex size-11 shrink-0 overflow-hidden rounded-md bg-fg text-bg', className)}>
      {src && <A.Image src={src} alt="" className="size-full object-cover" />}
      <A.Fallback className="flex size-full items-center justify-center font-display text-base font-extrabold">
        {name.trim().charAt(0).toUpperCase() || '?'}
      </A.Fallback>
    </A.Root>
  )
}
