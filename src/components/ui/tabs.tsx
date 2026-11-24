'use client'
import { Tabs as T } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cx } from '@/lib/cx'

export const Tabs = T.Root
export const TabsContent = T.Content

export function TabsList({ className, ...p }: ComponentProps<typeof T.List>) {
  return <T.List className={cx('inline-flex gap-1 rounded-md bg-surface-1 p-1', className)} {...p} />
}

export function Tab({ className, ...p }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cx(
        'min-h-11 rounded-sm px-4 font-semibold text-fg-3 transition-colors duration-hover',
        'hover:text-fg data-[state=active]:bg-surface-3 data-[state=active]:text-fg',
        className,
      )}
      {...p}
    />
  )
}
