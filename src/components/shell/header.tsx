import Link from 'next/link'
import { buttonClass } from '@/components/ui/button'
import type { PublicConfig } from '@/config'
import { AccountMenu } from './account-menu'
import { SearchBox } from './search-box'
import { Wordmark } from './wordmark'

type User = { name: string; email: string; image?: string | null }

// Task 06 adds Browse / Schedule here as those pages land.
const NAV = [{ href: '/', label: 'Home' }]

export function Header({ site, user }: { site: PublicConfig; user: User | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line-1 bg-bg/86 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-8">
        <Wordmark site={site} />
        <nav aria-label="Main" className="flex gap-0.5">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex min-h-11 items-center rounded-sm px-3 font-semibold text-fg-3 transition-colors duration-hover hover:bg-surface-3 hover:text-fg"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <SearchBox />
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <AccountMenu {...user} />
          ) : (
            <Link href="/sign-in" className={buttonClass('primary')}>
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
