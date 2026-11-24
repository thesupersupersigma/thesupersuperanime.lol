import { CircleAlert, CircleCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'

/** Form-level message. Errors are announced (role=alert); success uses role=status. */
export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success'; children: ReactNode }) {
  if (!children) return null
  const Icon = tone === 'error' ? CircleAlert : CircleCheck
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'flex animate-pop gap-2.5 rounded-md border p-3.5 text-sm',
        tone === 'error' ? 'border-fg-3 bg-surface-2 text-fg' : 'border-line-3 bg-surface-1 text-fg-2',
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  )
}
