import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getAuth } from '@/server/auth'
import { SettingsNav } from './settings-nav'

export const metadata: Metadata = { title: 'Settings', robots: { index: false, follow: false } }

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session) redirect('/sign-in?next=/settings')
  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 py-6">
      <h1 className="text-3xl font-extrabold">Settings</h1>
      <SettingsNav />
      <div className="flex animate-rise flex-col gap-6">{children}</div>
    </div>
  )
}
