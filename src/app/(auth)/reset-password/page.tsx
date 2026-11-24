'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { authClient } from '@/lib/auth-client'
import { errorText } from '@/lib/auth-ui'

export default function ResetPasswordPage() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')
  const [state, setState] = useState<{ busy?: boolean; error?: string | null }>({})

  return (
    <>
      <title>Set a new password</title>
      <h1 className="text-3xl font-extrabold">Set a new password</h1>
      {!token || params.get('error') ? (
        <>
          <Alert>This reset link is invalid or has expired.</Alert>
          <Link href="/forgot-password" className="font-semibold underline underline-offset-4">
            Send a new link
          </Link>
        </>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setState({ busy: true })
            const { error } = await authClient.resetPassword({
              token,
              newPassword: String(new FormData(e.currentTarget).get('password')),
            })
            if (error) return setState({ error: errorText(error) })
            router.push('/sign-in?reset=1')
          }}
        >
          <Alert>{state.error}</Alert>
          <Input
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            hint="At least 8 characters. You’ll be signed out everywhere else."
          />
          <Button type="submit" loading={state.busy}>
            Save password
          </Button>
        </form>
      )}
    </>
  )
}
