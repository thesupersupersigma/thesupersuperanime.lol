'use client'
import { KeyRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import type { SocialId } from '@/config'
import { authClient } from '@/lib/auth-client'
import { errorText, safeNext } from '@/lib/auth-ui'
import { SocialButtons } from '../social-buttons'

export function SignInForm({
  methods,
  canReset,
}: {
  methods: { email: boolean; social: SocialId[] }
  canReset: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params.get('next'))
  const [error, setError] = useState<string | null>(params.get('error') ? 'That sign-in didn’t work. Try again.' : null)
  const [busy, setBusy] = useState<'password' | 'passkey' | null>(null)

  const done = () => {
    router.push(next)
    router.refresh()
  }

  // Passkey autofill (conditional UI): the browser offers saved passkeys in the email field's suggestions.
  useEffect(() => {
    const ac = new AbortController()
    PublicKeyCredential?.isConditionalMediationAvailable?.().then((ok) => {
      if (!ok || ac.signal.aborted) return
      authClient.signIn.passkey({ autoFill: true, fetchOptions: { onSuccess: done } }).catch(() => {})
    })
    return () => ac.abort()
  }, [])

  const passkey = async () => {
    setBusy('passkey')
    setError(null)
    const res = await authClient.signIn.passkey()
    if (res?.error) {
      setError(errorText(res.error))
      setBusy(null)
    } else done()
  }

  return (
    <div className="flex flex-col gap-5">
      <Alert>{error}</Alert>
      {methods.email && (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            setBusy('password')
            setError(null)
            const { error } = await authClient.signIn.email({
              email: String(f.get('email')),
              password: String(f.get('password')),
              rememberMe: f.get('remember') === 'on',
            })
            if (error) {
              setError(errorText(error))
              setBusy(null)
            } else done() // with 2FA on, onTwoFactorRedirect has already moved to /two-factor
          }}
        >
          <Input label="Email" name="email" type="email" autoComplete="username webauthn" required />
          <Input label="Password" name="password" type="password" autoComplete="current-password" required />
          <div className="flex items-center justify-between gap-4">
            <label className="flex min-h-11 items-center gap-2 text-fg-2">
              <input type="checkbox" name="remember" defaultChecked className="size-4 accent-fg" /> Stay signed in
            </label>
            {canReset && (
              <Link
                href="/forgot-password"
                className="flex min-h-11 items-center text-fg-2 underline underline-offset-4"
              >
                Forgot password?
              </Link>
            )}
          </div>
          <Button type="submit" loading={busy === 'password'} disabled={busy !== null}>
            Sign in
          </Button>
        </form>
      )}
      <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
        <span className="h-px flex-1 bg-line-2" />
        or
        <span className="h-px flex-1 bg-line-2" />
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="secondary" onClick={passkey} loading={busy === 'passkey'} disabled={busy !== null}>
          <KeyRound aria-hidden className="size-4" /> Sign in with a passkey
        </Button>
        <SocialButtons providers={methods.social} next={next} onError={setError} />
      </div>
    </div>
  )
}
