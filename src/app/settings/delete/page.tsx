'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/field'
import { authClient } from '@/lib/auth-client'
import { errorText } from '@/lib/auth-ui'
import { Section } from '../section'

export default function DeleteAccountPage() {
  const router = useRouter()
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)
  const [state, setState] = useState<{ busy?: boolean; error?: string | null }>({})

  useEffect(() => {
    authClient
      .listAccounts()
      .then(({ data }) => setHasPassword(Boolean(data?.some((a) => a.providerId === 'credential'))))
  }, [])

  return (
    <Section
      title="Delete account"
      description="This removes your account, watch progress, lists, settings, passkeys and sessions for good. It can’t be undone."
    >
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="danger" className="self-start" disabled={hasPassword === null}>
            Delete my account
          </Button>
        </DialogTrigger>
        <DialogContent title="Delete your account?" description="Everything goes, right away. There’s no undo.">
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              setState({ busy: true })
              const { error } = await authClient.deleteUser({
                ...(hasPassword && { password: String(f.get('password')) }),
                callbackURL: '/',
              })
              if (error) return setState({ error: errorText(error) })
              router.push('/')
              router.refresh()
            }}
          >
            <Alert>{state.error}</Alert>
            {hasPassword && (
              <Input label="Your password" name="password" type="password" autoComplete="current-password" required />
            )}
            <Input
              label="Type DELETE to confirm"
              name="confirm"
              required
              pattern="DELETE"
              autoComplete="off"
              title="Type DELETE in capitals"
            />
            <Button type="submit" variant="danger" loading={state.busy}>
              Delete forever
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Section>
  )
}
