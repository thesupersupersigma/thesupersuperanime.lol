'use client'
import { passkeyClient } from '@better-auth/passkey/client'
import { twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

// Same origin as the page, so no baseURL: one built image works under any SITE_URL.
export const authClient = createAuthClient({
  plugins: [
    passkeyClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        const next = new URLSearchParams(location.search).get('next')
        location.assign(`/two-factor${next ? `?next=${encodeURIComponent(next)}` : ''}`)
      },
    }),
  ],
})
