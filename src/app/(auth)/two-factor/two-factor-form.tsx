'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Tab, Tabs, TabsContent, TabsList } from '@/components/ui/tabs'
import { authClient } from '@/lib/auth-client'
import { errorText, safeNext } from '@/lib/auth-ui'

type Method = 'totp' | 'backup' | 'email'

export function TwoFactorForm({ emailCodes }: { emailCodes: boolean }) {
  const router = useRouter()
  const next = safeNext(useSearchParams().get('next'))
  const [method, setMethod] = useState<Method>('totp')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const code = String(f.get('code')).replace(/\s/g, '')
    const trustDevice = f.get('trust') === 'on'
    setBusy(true)
    setError(null)
    const { error } =
      method === 'totp'
        ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
        : method === 'backup'
          ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
          : await authClient.twoFactor.verifyOtp({ code, trustDevice })
    if (error) {
      setBusy(false)
      setError(error.status === 401 && !error.code ? 'This sign-in took too long. Sign in again.' : errorText(error))
      return
    }
    router.push(next)
    router.refresh()
  }

  const form = (label: string, hint: string, autoComplete: string, extra?: React.ReactNode) => (
    <form className="flex flex-col gap-4 pt-4" onSubmit={submit}>
      {extra}
      <Input
        label={label}
        name="code"
        hint={hint}
        autoComplete={autoComplete}
        inputMode={method === 'backup' ? 'text' : 'numeric'}
        required
        autoFocus
      />
      <label className="flex min-h-11 items-center gap-2 text-fg-2">
        <input type="checkbox" name="trust" className="size-4 accent-fg" /> Trust this device for 30 days
      </label>
      <Button type="submit" loading={busy}>
        Verify
      </Button>
    </form>
  )

  return (
    <div className="flex flex-col gap-4">
      <Alert>{error}</Alert>
      <Tabs
        value={method}
        onValueChange={(v) => {
          setMethod(v as Method)
          setError(null)
        }}
      >
        <TabsList aria-label="Verification method" className="flex w-full">
          <Tab value="totp" className="flex-1">
            App
          </Tab>
          <Tab value="backup" className="flex-1">
            Backup code
          </Tab>
          {emailCodes && (
            <Tab value="email" className="flex-1">
              Email
            </Tab>
          )}
        </TabsList>
        <TabsContent value="totp">{form('6-digit code', 'From your authenticator app.', 'one-time-code')}</TabsContent>
        <TabsContent value="backup">
          {form('Backup code', 'One of the codes you saved when you turned on 2FA. Each works once.', 'off')}
        </TabsContent>
        {emailCodes && (
          <TabsContent value="email">
            {form(
              'Code from your email',
              'It expires in 3 minutes.',
              'one-time-code',
              <Button
                variant="secondary"
                onClick={async () => {
                  setError(null)
                  const { error } = await authClient.twoFactor.sendOtp()
                  if (error) setError(errorText(error))
                  else setEmailSent(true)
                }}
              >
                {emailSent ? 'Send another code' : 'Email me a code'}
              </Button>,
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
