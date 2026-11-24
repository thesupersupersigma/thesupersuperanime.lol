'use client'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { authClient } from '@/lib/auth-client'
import { errorText } from '@/lib/auth-ui'

export function ForgotForm() {
  const [state, setState] = useState<{ busy?: boolean; error?: string | null; sent?: string }>({})
  if (state.sent)
    return (
      <Alert tone="success">
        If an account uses <strong className="text-fg">{state.sent}</strong>, a reset link is on its way. It works for
        one hour.
      </Alert>
    )
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        const email = String(new FormData(e.currentTarget).get('email'))
        setState({ busy: true })
        const { error } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })
        setState(error ? { error: errorText(error) } : { sent: email })
      }}
    >
      <Alert>{state.error}</Alert>
      <Input label="Email" name="email" type="email" autoComplete="email" required />
      <Button type="submit" loading={state.busy}>
        Send reset link
      </Button>
    </form>
  )
}
