import type { Metadata } from 'next'
import Link from 'next/link'
import { enabledMethods, getConfig } from '@/config'
import { SignUpForm } from './sign-up-form'

export const metadata: Metadata = { title: 'Create an account' }

export default function SignUpPage() {
  const c = getConfig()
  const methods = enabledMethods(c)
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold">Create an account</h1>
        <p className="text-fg-3">Anything you watched as a guest in this browser moves into your account.</p>
      </div>
      {methods.email || methods.social.length ? (
        <SignUpForm methods={methods} verifies={Boolean(c.smtp)} />
      ) : (
        <p className="rounded-lg border border-line-2 bg-surface-1 p-5 text-fg-2">
          Accounts aren’t set up on this site.
        </p>
      )}
      <p className="text-center text-fg-3">
        Already have one?{' '}
        <Link href="/sign-in" className="font-semibold text-fg underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  )
}
