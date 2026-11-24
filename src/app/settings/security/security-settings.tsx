'use client'
import { KeyRound, Laptop, Pencil, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { useCallback, useEffect, useState } from 'react'
import { PROVIDER_NAMES } from '@/app/(auth)/social-buttons'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import type { SocialId } from '@/config'
import { authClient } from '@/lib/auth-client'
import { errorText } from '@/lib/auth-ui'
import { Section } from '../section'

type Account = { id: string; providerId: string; accountId: string }

export function SecuritySettings({ social, emailCodes }: { social: SocialId[]; emailCodes: boolean }) {
  const { data: session, refetch } = authClient.useSession()
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const loadAccounts = useCallback(
    () => authClient.listAccounts().then(({ data }) => setAccounts((data as Account[] | null) ?? [])),
    [],
  )
  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  if (!session || !accounts) return <p role="status">Loading…</p>
  const hasPassword = accounts.some((a) => a.providerId === 'credential')
  const twoFactorOn = Boolean((session.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled)

  return (
    <>
      {hasPassword && <PasswordSection />}
      <TwoFactorSection hasPassword={hasPassword} on={twoFactorOn} emailCodes={emailCodes} onChange={refetch} />
      <PasskeySection />
      <LinkedSection accounts={accounts} social={social} reload={loadAccounts} />
      <SessionsSection currentToken={session.session.token} />
    </>
  )
}

// ---------------------------------------------------------------- password

function PasswordSection() {
  const [s, setS] = useState<{ busy?: boolean; error?: string | null; ok?: string }>({})
  return (
    <Section title="Password">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          const form = e.currentTarget
          const f = new FormData(form)
          setS({ busy: true })
          const { error } = await authClient.changePassword({
            currentPassword: String(f.get('current')),
            newPassword: String(f.get('new')),
            revokeOtherSessions: f.get('revoke') === 'on',
          })
          if (error) return setS({ error: errorText(error) })
          form.reset()
          setS({ ok: 'Password changed.' })
        }}
      >
        <Alert>{s.error}</Alert>
        <Alert tone="success">{s.ok}</Alert>
        <Input label="Current password" name="current" type="password" autoComplete="current-password" required />
        <Input
          label="New password"
          name="new"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          hint="At least 8 characters."
        />
        <label className="flex min-h-11 items-center gap-2 text-fg-2">
          <input type="checkbox" name="revoke" defaultChecked className="size-4 accent-fg" /> Sign out everywhere else
        </label>
        <Button type="submit" className="self-start" loading={s.busy}>
          Change password
        </Button>
      </form>
    </Section>
  )
}

// ---------------------------------------------------------------- 2FA

/** Shows the codes once, with copy + download. */
function BackupCodes({ codes }: { codes: string[] }) {
  const text = codes.join('\n')
  return (
    <div className="flex flex-col gap-3">
      <p className="text-fg-2">
        Save these backup codes somewhere safe. Each one signs you in once if you lose your phone.{' '}
        <strong className="text-fg">You won’t see them again.</strong>
      </p>
      <ul
        aria-label="Backup codes"
        className="grid grid-cols-2 gap-2 rounded-md bg-surface-2 p-4 font-mono text-[15px]"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => navigator.clipboard.writeText(text)}>
          Copy
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            const a = document.createElement('a')
            a.href = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }))
            a.download = 'backup-codes.txt'
            a.click()
            URL.revokeObjectURL(a.href)
          }}
        >
          Download
        </Button>
      </div>
    </div>
  )
}

type TwoFAStep =
  | { kind: 'closed' }
  | { kind: 'password'; action: 'enable' | 'disable' | 'codes' }
  | { kind: 'scan'; uri: string; qr: string; secret: string; codes: string[] }
  | { kind: 'codes'; codes: string[] }

function TwoFactorSection({
  hasPassword,
  on,
  emailCodes,
  onChange,
}: {
  hasPassword: boolean
  on: boolean
  emailCodes: boolean
  onChange: () => void
}) {
  const [step, setStep] = useState<TwoFAStep>({ kind: 'closed' })
  const [s, setS] = useState<{ busy?: boolean; error?: string | null }>({})
  const close = () => {
    setStep({ kind: 'closed' })
    setS({})
  }

  const withPassword = async (password: string, then: 'enable' | 'disable' | 'codes') => {
    setS({ busy: true })
    if (then === 'enable') {
      const { data, error } = await authClient.twoFactor.enable({ password, method: 'totp' })
      if (error || data?.method !== 'totp') return setS({ error: errorText(error) })
      const secret = new URL(data.totpURI).searchParams.get('secret') ?? ''
      const qr = await QRCode.toDataURL(data.totpURI, {
        margin: 1,
        width: 200,
        color: { dark: '#0e0e0e', light: '#f5f5f5' },
      })
      setStep({ kind: 'scan', uri: data.totpURI, qr, secret, codes: data.backupCodes })
    } else if (then === 'disable') {
      const { error } = await authClient.twoFactor.disable({ password })
      if (error) return setS({ error: errorText(error) })
      onChange()
      close()
    } else {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({ password })
      if (error || !data) return setS({ error: errorText(error) })
      setStep({ kind: 'codes', codes: data.backupCodes })
    }
    setS({})
  }

  return (
    <Section
      title="Two-step verification"
      description={
        hasPassword
          ? `Asks for a code from your authenticator app${emailCodes ? ' (or email)' : ''} after your password. Passkey sign-in and linked accounts (Discord, Google…) don’t ask for it.`
          : 'Two-step verification protects password sign-in. Your account has no password, so there’s nothing to protect here — passkeys and your linked accounts have their own checks.'
      }
    >
      {hasPassword && (
        <div className="flex flex-wrap items-center gap-3">
          <Badge kind={on ? 'sub' : 'neutral'}>{on ? 'ON' : 'OFF'}</Badge>
          {on ? (
            <>
              <Button variant="secondary" onClick={() => setStep({ kind: 'password', action: 'codes' })}>
                New backup codes
              </Button>
              <Button variant="danger" onClick={() => setStep({ kind: 'password', action: 'disable' })}>
                Turn off
              </Button>
            </>
          ) : (
            <Button onClick={() => setStep({ kind: 'password', action: 'enable' })}>Turn on</Button>
          )}
        </div>
      )}
      <Dialog open={step.kind !== 'closed'} onOpenChange={(o) => !o && close()}>
        {step.kind === 'password' && (
          <DialogContent title="Confirm it’s you" description="Enter your password to continue.">
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                withPassword(String(new FormData(e.currentTarget).get('password')), step.action)
              }}
            >
              <Alert>{s.error}</Alert>
              <Input
                label="Password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
              />
              <Button type="submit" loading={s.busy}>
                Continue
              </Button>
            </form>
          </DialogContent>
        )}
        {step.kind === 'scan' && (
          <DialogContent title="Set up your authenticator app">
            <ol className="flex list-decimal flex-col gap-3 pl-5 text-fg-2">
              <li>Scan this QR code with your authenticator app (or enter the key by hand).</li>
              <li>Type the 6-digit code it shows.</li>
            </ol>
            <img
              src={step.qr}
              alt="QR code for your authenticator app"
              width={200}
              height={200}
              className="self-center rounded-md"
            />
            <p className="text-sm text-fg-3">
              Key: <code className="break-all font-mono text-fg">{step.secret}</code>
            </p>
            <form
              className="flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault()
                setS({ busy: true })
                const { error } = await authClient.twoFactor.verifyTotp({
                  code: String(new FormData(e.currentTarget).get('code')).replace(/\s/g, ''),
                })
                if (error) return setS({ error: errorText(error) })
                setS({})
                onChange()
                setStep({ kind: 'codes', codes: step.codes })
              }}
            >
              <Alert>{s.error}</Alert>
              <Input label="6-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
              <Button type="submit" loading={s.busy}>
                Turn on
              </Button>
            </form>
          </DialogContent>
        )}
        {step.kind === 'codes' && (
          <DialogContent title="Your backup codes">
            <BackupCodes codes={step.codes} />
            <Button onClick={close}>I saved them</Button>
          </DialogContent>
        )}
      </Dialog>
    </Section>
  )
}

// ---------------------------------------------------------------- passkeys

function PasskeySection() {
  const { data: passkeys, refetch } = authClient.useListPasskeys()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)

  return (
    <Section title="Passkeys" description="Sign in with your fingerprint, face or screen lock instead of a password.">
      <Alert>{error}</Alert>
      {passkeys?.length ? (
        <ul className="flex flex-col divide-y divide-line-2">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <KeyRound aria-hidden className="size-4 text-muted" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{p.name || 'Passkey'}</span>
                <span className="text-xs text-muted">
                  Added {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''}
                </span>
              </span>
              <IconButton
                label={`Rename ${p.name || 'passkey'}`}
                icon={<Pencil />}
                variant="ghost"
                onClick={() => setRenaming({ id: p.id, name: p.name ?? '' })}
              />
              <IconButton
                label={`Delete ${p.name || 'passkey'}`}
                icon={<Trash2 />}
                variant="ghost"
                onClick={async () => {
                  setError(null)
                  const { error } = await authClient.passkey.deletePasskey({ id: p.id })
                  if (error) return setError(errorText(error))
                  refetch()
                  toast({ text: 'Passkey deleted' })
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-3">No passkeys yet.</p>
      )}
      <Button
        className="self-start"
        loading={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          const res = await authClient.passkey.addPasskey({ name: deviceName() })
          setBusy(false)
          if (res?.error) return setError(errorText(res.error))
          refetch()
          toast({ text: 'Passkey added' })
        }}
      >
        Add a passkey
      </Button>
      <Dialog open={Boolean(renaming)} onOpenChange={(o) => !o && setRenaming(null)}>
        {renaming && (
          <DialogContent title="Rename passkey">
            <form
              className="flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault()
                const name = String(new FormData(e.currentTarget).get('name'))
                const { error } = await authClient.passkey.updatePasskey({ id: renaming.id, name })
                if (error) return setError(errorText(error))
                setRenaming(null)
                refetch()
              }}
            >
              <Input label="Name" name="name" defaultValue={renaming.name} maxLength={64} required autoFocus />
              <Button type="submit">Save</Button>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </Section>
  )
}

/** A friendly default name like "Chrome on Windows". */
function deviceName() {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser'
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'this device'
  return `${browser} on ${os}`
}

// ---------------------------------------------------------------- linked accounts

function LinkedSection({ accounts, social, reload }: { accounts: Account[]; social: SocialId[]; reload: () => void }) {
  const [error, setError] = useState<string | null>(null)
  if (!social.length) return null
  return (
    <Section title="Linked accounts" description="Sign in with any of these. You can’t unlink the last way to sign in.">
      <Alert>{error}</Alert>
      <ul className="flex flex-col divide-y divide-line-2">
        {social.map((p) => {
          const linked = accounts.find((a) => a.providerId === p)
          return (
            <li key={p} className="flex min-h-14 items-center justify-between gap-3 py-2">
              <span className="font-semibold">{PROVIDER_NAMES[p]}</span>
              {linked ? (
                <Button
                  variant="secondary"
                  disabled={accounts.length <= 1}
                  onClick={async () => {
                    setError(null)
                    const { error } = await authClient.unlinkAccount({ accountId: linked.id })
                    if (error) setError(errorText(error))
                    reload()
                  }}
                >
                  Unlink
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    setError(null)
                    const { error } = await authClient.linkSocial({ provider: p, callbackURL: '/settings/security' })
                    if (error) setError(errorText(error))
                  }}
                >
                  Link
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

// ---------------------------------------------------------------- sessions

type SessionRow = { id: string; token: string; userAgent?: string | null; ipAddress?: string | null; createdAt: Date }

function SessionsSection({ currentToken }: { currentToken: string }) {
  const router = useRouter()
  const toast = useToast()
  const [rows, setRows] = useState<SessionRow[] | null>(null)
  const load = useCallback(
    () => authClient.listSessions().then(({ data }) => setRows((data as SessionRow[]) ?? [])),
    [],
  )
  useEffect(() => {
    load()
  }, [load])
  const others = rows?.filter((r) => r.token !== currentToken) ?? []

  return (
    <Section title="Where you’re signed in">
      <ul className="flex flex-col divide-y divide-line-2" aria-busy={!rows}>
        {rows?.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2">
            <Laptop aria-hidden className="size-4 shrink-0 text-muted" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{describeUA(r.userAgent)}</span>
              <span className="text-xs text-muted">
                {r.token === currentToken ? 'This device' : `Since ${new Date(r.createdAt).toLocaleDateString()}`}
                {r.ipAddress ? ` · ${r.ipAddress}` : ''}
              </span>
            </span>
            {r.token !== currentToken && (
              <Button
                variant="ghost"
                onClick={async () => {
                  await authClient.revokeSession({ token: r.token })
                  load()
                }}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        className="self-start"
        disabled={!others.length}
        onClick={async () => {
          const { error } = await authClient.revokeOtherSessions()
          if (error) return toast({ text: errorText(error) ?? 'Could not sign out other devices' })
          await load()
          router.refresh()
          toast({ text: 'Signed out everywhere else' })
        }}
      >
        Sign out everywhere else
      </Button>
    </Section>
  )
}

function describeUA(ua?: string | null) {
  if (!ua) return 'Unknown device'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser'
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'unknown system'
  return `${browser} on ${os}`
}
