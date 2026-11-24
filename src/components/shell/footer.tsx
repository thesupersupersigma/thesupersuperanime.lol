import type { PublicConfig } from '@/config'
import { Wordmark } from './wordmark'

const SOURCE_URL = 'https://github.com/thesupersupersigma/thesupersuperanime.lol'

export function Footer({ site }: { site: PublicConfig }) {
  const links = [
    site.discordInviteUrl && { href: site.discordInviteUrl, label: 'Discord' },
    { href: SOURCE_URL, label: 'Source code' },
  ].filter((l): l is { href: string; label: string } => Boolean(l))
  return (
    <footer className="mt-18 border-t border-line-1">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-6 px-4 pt-8 pb-11 sm:px-8">
        <Wordmark site={site} className="font-display text-xl font-extrabold tracking-[-0.02em]" />
        <nav aria-label="Footer" className="flex flex-wrap gap-5 text-[13px]">
          {links.map((l) => (
            <a key={l.href} href={l.href} rel="noopener" className="flex min-h-11 items-center text-fg-3 hover:text-fg">
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
