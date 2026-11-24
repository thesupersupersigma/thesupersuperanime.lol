'use client'
import { ArrowUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cx } from '@/lib/cx'
import { prefersReducedMotion } from '@/lib/motion'

export function BackToTop() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const on = () => setShow(scrollY > 600)
    on()
    addEventListener('scroll', on, { passive: true })
    return () => removeEventListener('scroll', on)
  }, [])
  return (
    <button
      type="button"
      aria-label="Back to top"
      tabIndex={show ? 0 : -1}
      aria-hidden={!show}
      onClick={() => {
        scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
        document.getElementById('main')?.focus({ preventScroll: true })
      }}
      className={cx(
        'fixed right-6 bottom-6 z-30 flex size-12 items-center justify-center rounded-lg border border-line-3 bg-surface-2',
        'transition-[opacity,transform] duration-slow ease-out hover:-translate-y-px',
        show ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <ArrowUp aria-hidden className="size-[18px]" />
    </button>
  )
}
