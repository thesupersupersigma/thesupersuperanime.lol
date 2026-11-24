import type { Metadata } from 'next'
import Link from 'next/link'
import { enabledMethods, getConfig } from '@/config'
import { SignInForm } from './sign-in-form'

export const metadata: Metadata = { title: 'Sign in' }

export default function SignInPage() {
  const c = getConfig()
  const methods = enabledMethods(c)
  const any = methods.email || methods.social.length > 0
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold">Sign in</h1>
        <p className="text-fg-3">Keep your progress, lists and settings on every device.</p>
      </div>
      {any ? (
        <SignInForm methods={methods} canReset={Boolean(c.smtp)} />
      ) : (
        <p className="rounded-lg border border-line-2 bg-surface-1 p-5 text-fg-2">
          Accounts aren’t set up on this site. You can still watch as a guest: your progress stays in this browser.
        </p>
      )}
      {methods.email && (
        <p className="text-center text-fg-3">
          New here?{' '}
          <Link href="/sign-up" className="font-semibold text-fg underline underline-offset-4">
            Create an account
          </Link>
        </p>
      )}
    </>
  )
}
