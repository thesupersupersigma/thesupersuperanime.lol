'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import type { SocialId } from '@/config'
import { authClient } from '@/lib/auth-client'
import { errorText, safeNext } from '@/lib/auth-ui'
import { SocialButtons } from '../social-buttons'

export function SignUpForm({
  methods,
  verifies,
}: {
  methods: { email: boolean; social: SocialId[] }
  verifies: boolean
}) {
  const router = useRouter()
  const next = safeNext(useSearchParams().get('next'))
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({})
  const [busy, setBusy] = useState(false)

  return (
    <div className="flex flex-col gap-5">
      <Alert>{error}</Alert>
      {methods.email && (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const email = String(f.get('email'))
            setBusy(true)
            setError(null)
            setFieldError({})
            const { error } = await authClient.signUp.email({
              name: String(f.get('name')),
              email,
              password: String(f.get('password')),
              callbackURL: `/verify-email?ok=1&next=${encodeURIComponent(next)}`,
            })
            setBusy(false)
            if (error) {
              const msg = errorText(error)
              if (error.code?.includes('PASSWORD')) setFieldError({ password: msg ?? undefined })
              else if (error.code?.includes('EMAIL') || error.code?.includes('USER_ALREADY'))
                setFieldError({ email: msg ?? undefined })
              else setError(msg)
              return
            }
            if (verifies) router.push(`/verify-email?sent=${encodeURIComponent(email)}`)
            else {
              router.push(next)
              router.refresh()
            }
          }}
        >
          <Input label="Name" name="name" autoComplete="name" required maxLength={64} />
          <Input label="Email" name="email" type="email" autoComplete="email" required error={fieldError.email} />
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            hint="At least 8 characters. A password manager makes this easy."
            error={fieldError.password}
          />
          <Button type="submit" loading={busy}>
            Create account
          </Button>
        </form>
      )}
      <SocialButtons providers={methods.social} next={next} onError={setError} />
    </div>
  )
}
