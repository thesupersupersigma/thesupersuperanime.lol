'use client'
import { Check, ChevronDown } from 'lucide-react'
import { Select as S, Switch as Sw } from 'radix-ui'
import { type ComponentProps, type ReactNode, useId } from 'react'
import { cx } from '@/lib/cx'

const control =
  'min-h-11 w-full rounded-md border border-line-2 bg-surface-1 px-3.5 text-fg placeholder:text-muted ' +
  'transition-colors duration-hover hover:border-line-3 focus-visible:border-fg aria-invalid:border-fg'

/** Labelled input; `error` and `hint` sit under the field and are linked with aria-describedby. */
export function Input({
  label,
  hint,
  error,
  className,
  id,
  ...p
}: ComponentProps<'input'> & { label: string; hint?: ReactNode; error?: string | null }) {
  const auto = useId()
  const fid = id ?? auto
  const describedBy = [error && `${fid}-err`, hint && `${fid}-hint`].filter(Boolean).join(' ') || undefined
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={fid} className="text-sm font-medium text-fg-2">
        {label}
      </label>
      <input
        id={fid}
        className={control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...p}
      />
      {hint && (
        <p id={`${fid}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fid}-err`} className="text-xs font-medium text-fg">
          {error}
        </p>
      )}
    </div>
  )
}

export function Select({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string
  value: string
  onValueChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg-2">
        {label}
      </label>
      <S.Root value={value} onValueChange={onValueChange}>
        <S.Trigger id={id} className={cx(control, 'flex items-center justify-between gap-2 text-left')}>
          <S.Value />
          <S.Icon>
            <ChevronDown aria-hidden className="size-4 text-muted" />
          </S.Icon>
        </S.Trigger>
        <S.Portal>
          <S.Content
            position="popper"
            sideOffset={6}
            className="z-50 min-w-(--radix-select-trigger-width) animate-pop rounded-lg border border-line-3 bg-surface-1 p-1 shadow-pop"
          >
            <S.Viewport>
              {options.map((o) => (
                <S.Item
                  key={o.value}
                  value={o.value}
                  className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-sm px-3 outline-none data-highlighted:bg-surface-3"
                >
                  <S.ItemText>{o.label}</S.ItemText>
                  <S.ItemIndicator>
                    <Check aria-hidden className="size-4" />
                  </S.ItemIndicator>
                </S.Item>
              ))}
            </S.Viewport>
          </S.Content>
        </S.Portal>
      </S.Root>
    </div>
  )
}

export function Switch({
  label,
  description,
  ...p
}: ComponentProps<typeof Sw.Root> & { label: string; description?: string }) {
  const id = useId()
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <div className="flex flex-col">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {description && <span className="text-xs text-muted">{description}</span>}
      </div>
      <Sw.Root
        id={id}
        className="relative h-7 w-12 shrink-0 rounded-full border border-line-3 bg-surface-2 transition-colors duration-hover data-[state=checked]:bg-fg"
        {...p}
      >
        <Sw.Thumb className="block size-5 translate-x-1 rounded-full bg-fg-3 transition-transform duration-hover ease-out data-[state=checked]:translate-x-6 data-[state=checked]:bg-bg" />
      </Sw.Root>
    </div>
  )
}
