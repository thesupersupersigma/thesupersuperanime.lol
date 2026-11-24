import type { Metadata } from 'next'
import { getConfig } from '@/config'
import { ForgotForm } from './forgot-form'

export const metadata: Metadata = { title: 'Reset your password' }

export default function ForgotPasswordPage() {
  const canReset = Boolean(getConfig().smtp)
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold">Reset your password</h1>
        <p className="text-fg-3">
          {canReset
            ? 'Enter your email and we’ll send you a link to set a new password.'
            : 'This site can’t send emails, so passwords can’t be reset here. Ask the site’s owner for help.'}
        </p>
      </div>
      {canReset && <ForgotForm />}
    </>
  )
}
