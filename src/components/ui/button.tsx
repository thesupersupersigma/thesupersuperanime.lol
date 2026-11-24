import { Loader2 } from 'lucide-react'
import { Slot } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cx } from '@/lib/cx'
import { Tooltip } from './tooltip'

const variants = {
  primary: 'bg-fg text-bg hover:bg-white',
  secondary: 'border border-line-2 bg-surface-1 text-fg hover:bg-surface-3',
  ghost: 'text-fg-3 hover:bg-surface-3 hover:text-fg',
  danger: 'border border-fg-3 text-fg hover:bg-fg hover:text-bg',
}

export const buttonClass = (variant: keyof typeof variants = 'primary', className?: string) =>
  cx(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 font-semibold select-none',
    'transition-[transform,background-color,color,opacity] duration-hover ease-out hover:-translate-y-px active:scale-[.97]',
    'disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none',
    variants[variant],
    className,
  )

type ButtonProps = ComponentProps<'button'> & { variant?: keyof typeof variants; loading?: boolean; asChild?: boolean }

export function Button({ variant, loading, asChild, className, children, type = 'button', ...p }: ButtonProps) {
  if (asChild)
    return (
      <Slot.Root className={buttonClass(variant, className)} {...p}>
        {children}
      </Slot.Root>
    )
  return (
    <button type={type} className={buttonClass(variant, className)} aria-busy={loading || undefined} {...p}>
      {loading && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

/** Icon-only button: `label` is its accessible name and its tooltip. */
export function IconButton({
  label,
  icon,
  variant = 'secondary',
  className,
  type = 'button',
  ...p
}: Omit<ComponentProps<'button'>, 'children'> & { label: string; icon: ReactNode; variant?: keyof typeof variants }) {
  return (
    <Tooltip content={label}>
      <button
        type={type}
        aria-label={label}
        className={buttonClass(variant, cx('size-11 rounded-md px-0 [&_svg]:size-[18px]', className))}
        {...p}
      >
        {icon}
      </button>
    </Tooltip>
  )
}
