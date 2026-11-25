import Link from 'next/link'
import { buttonClass } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-start gap-3 py-16">
      <p className="font-display text-6xl font-extrabold text-muted">404</p>
      <h1 className="text-3xl font-extrabold">Nothing here</h1>
      <p className="text-fg-2">This anime or episode doesn’t exist, or the link is wrong. Try searching for it.</p>
      <div className="flex gap-2">
        <Link href="/search" className={buttonClass('primary')}>
          Search
        </Link>
        <Link href="/" className={buttonClass('secondary')}>
          Home
        </Link>
      </div>
    </div>
  )
}
