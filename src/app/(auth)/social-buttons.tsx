'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { SocialId } from '@/config'
import { authClient } from '@/lib/auth-client'
import { errorText } from '@/lib/auth-ui'

export const PROVIDER_NAMES: Record<SocialId, string> = {
  discord: 'Discord',
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
}

/** One button per configured provider; nothing renders for providers that aren't set up. */
export function SocialButtons({
  providers,
  next,
  onError,
}: {
  providers: SocialId[]
  next: string
  onError: (msg: string | null) => void
}) {
  const [busy, setBusy] = useState<SocialId | null>(null)
  if (!providers.length) return null
  return (
    <div className="flex flex-col gap-2">
      {providers.map((p) => (
        <Button
          key={p}
          variant="secondary"
          loading={busy === p}
          disabled={busy !== null}
          onClick={async () => {
            setBusy(p)
            onError(null)
            const { error } = await authClient.signIn.social({
              provider: p,
              callbackURL: next,
              errorCallbackURL: '/sign-in',
            })
            if (error) {
              onError(errorText(error))
              setBusy(null)
            }
          }}
        >
          Continue with {PROVIDER_NAMES[p]}
        </Button>
      ))}
    </div>
  )
}
