import type { Metadata } from 'next'
import { getConfig } from '@/config'
import { TwoFactorForm } from './two-factor-form'

export const metadata: Metadata = { title: 'Two-step verification' }

export default function TwoFactorPage() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold">Two-step verification</h1>
        <p className="text-fg-3">Your password was right. One more step to make sure it’s you.</p>
      </div>
      <TwoFactorForm emailCodes={Boolean(getConfig().smtp)} />
    </>
  )
}
