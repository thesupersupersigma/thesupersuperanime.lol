'use client'
import { Tooltip as T } from 'radix-ui'
import type { ReactNode } from 'react'

export const TooltipProvider = T.Provider

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          sideOffset={6}
          className="z-50 animate-pop rounded-sm border border-line-3 bg-surface-2 px-2 py-1 text-xs font-medium text-fg shadow-pop"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
