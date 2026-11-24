'use client'
import { DropdownMenu as M } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cx } from '@/lib/cx'

export const Menu = M.Root
export const MenuTrigger = M.Trigger

export function MenuContent({ className, ...p }: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align="end"
        sideOffset={8}
        className={cx(
          'z-50 min-w-56 animate-pop rounded-lg border border-line-3 bg-surface-1 p-1 shadow-pop',
          className,
        )}
        {...p}
      />
    </M.Portal>
  )
}

export function MenuItem({ className, ...p }: ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cx(
        'flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-3 font-medium outline-none',
        'data-highlighted:bg-surface-3 [&_svg]:size-4 [&_svg]:text-muted',
        className,
      )}
      {...p}
    />
  )
}

export const MenuLabel = ({ className, ...p }: ComponentProps<typeof M.Label>) => (
  <M.Label className={cx('px-3 py-2 text-xs text-muted', className)} {...p} />
)
export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-line-2" />
