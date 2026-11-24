'use client'
import { X } from 'lucide-react'
import { Dialog as D } from 'radix-ui'
import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

/** Centered dialog, or a right/bottom sheet with `sheet`. Radix traps and returns focus; Esc closes. */
export function DialogContent({
  title,
  description,
  sheet,
  children,
}: {
  title: string
  description?: ReactNode
  sheet?: 'right' | 'bottom'
  children: ReactNode
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 animate-pop bg-black/70 backdrop-blur-sm" />
      <D.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cx(
          'fixed z-50 flex flex-col gap-4 overflow-y-auto border border-line-3 bg-surface-1 p-6 shadow-pop outline-none',
          !sheet && 'top-1/2 left-1/2 max-h-[90dvh] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-xl',
          sheet === 'right' && 'inset-y-0 right-0 w-[min(92vw,420px)] animate-rise',
          sheet === 'bottom' && 'inset-x-0 bottom-0 max-h-[85dvh] animate-rise rounded-t-xl',
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <D.Title className="font-display text-xl font-bold">{title}</D.Title>
          <D.Close
            aria-label="Close"
            className="-m-2 flex size-11 items-center justify-center rounded-md text-fg-3 hover:bg-surface-3 hover:text-fg"
          >
            <X aria-hidden className="size-[18px]" />
          </D.Close>
        </div>
        {description && <D.Description className="text-fg-3">{description}</D.Description>}
        {children}
      </D.Content>
    </D.Portal>
  )
}
