'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cx } from '@/lib/cx'

const LINKS = [
  { href: '/settings', label: 'Account' },
  { href: '/settings/security', label: 'Security' },
  { href: '/settings/delete', label: 'Delete account' },
]

export function SettingsNav() {
  const path = usePathname()
  return (
    <nav aria-label="Settings" className="flex flex-wrap gap-1 rounded-md bg-surface-1 p-1 self-start">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={path === l.href ? 'page' : undefined}
          className={cx(
            'flex min-h-11 items-center rounded-sm px-4 font-semibold text-fg-3 transition-colors duration-hover hover:text-fg',
            path === l.href && 'bg-surface-3 text-fg',
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  )
}
