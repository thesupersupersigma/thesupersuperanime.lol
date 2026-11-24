import Image from 'next/image'
import Link from 'next/link'
import type { PublicConfig } from '@/config'

/** SITE_LOGO_URL if set, else SITE_NAME in Syne. */
export function Wordmark({ site, className }: { site: PublicConfig; className?: string }) {
  return (
    <Link href="/" className={className ?? 'font-display text-[21px] font-extrabold tracking-[-0.02em]'}>
      {site.logoUrl ? (
        <Image src={site.logoUrl} alt={site.name} width={160} height={32} className="h-8 w-auto" unoptimized />
      ) : (
        site.name
      )}
    </Link>
  )
}
