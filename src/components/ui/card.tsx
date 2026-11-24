import type { ComponentProps } from 'react'
import { cx } from '@/lib/cx'

export function Card({ className, ...p }: ComponentProps<'div'>) {
  return <div className={cx('rounded-lg border border-line-1 bg-surface-1', className)} {...p} />
}

/** Placeholder block. Wrap loading regions in SkeletonGroup, which carries aria-busy and a label. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('skeleton rounded-md', className)} />
}

export function SkeletonGroup({ label, ...p }: ComponentProps<'div'> & { label: string }) {
  return <div role="status" aria-busy="true" aria-label={label} {...p} />
}
