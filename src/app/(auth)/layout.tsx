import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[440px] animate-rise flex-col gap-6 py-8 sm:py-14">{children}</div>
}
