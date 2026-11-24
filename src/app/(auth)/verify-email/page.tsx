'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button, buttonClass } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { authClient } from '@/lib/auth-client'
import { errorText, safeNext } from '@/lib/auth-ui'

/** Three states: just signed up (?sent=email), link worked (?ok=1), link failed (?error=…). */
export default function VerifyEmailPage() {
  const params = useSearchParams()
  const sent = params.get('sent')
  const [resend, setResend] = useState<{ busy?: boolean; msg?: string | null; error?: string | null }>({})

  if (params.get('ok') && !params.get('error'))
    return (
      <>
        <title>Email confirmed</title>
        <h1 className="text-3xl font-extrabold">Email confirmed</h1>
        <Alert tone="success">You’re signed in. Welcome!</Alert>
        <Link href={safeNext(params.get('next'))} className={buttonClass()}>
          Continue
        </Link>
      </>
    )

  return (
    <>
      <title>Confirm your email</title>
      <h1 className="text-3xl font-extrabold">Confirm your email</h1>
      {params.get('error') ? (
        <Alert>That confirmation link is invalid or has expired. Send yourself a new one.</Alert>
      ) : (
        <p className="text-fg-2">
          We sent a link to <strong className="text-fg">{sent ?? 'your email'}</strong>. Open it to finish creating your
          account. Check your spam folder if it isn’t there in a minute.
        </p>
      )}
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setResend({ busy: true })
          const { error } = await authClient.sendVerificationEmail({
            email: String(new FormData(e.currentTarget).get('email')),
            callbackURL: '/verify-email?ok=1',
          })
          setResend(error ? { error: errorText(error) } : { msg: 'Sent. Check your inbox.' })
        }}
      >
        <Alert>{resend.error}</Alert>
        <Alert tone="success">{resend.msg}</Alert>
        <Input label="Email" name="email" type="email" autoComplete="email" defaultValue={sent ?? ''} required />
        <Button type="submit" variant="secondary" loading={resend.busy}>
          Send the link again
        </Button>
      </form>
    </>
  )
}
