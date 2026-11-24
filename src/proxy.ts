import { type NextRequest, NextResponse } from 'next/server'
import { getConfig } from '@/config'

// Where each provider's profile pictures live (Microsoft's come inline as data: URLs).
const AVATAR_ORIGINS = {
  discord: 'https://cdn.discordapp.com',
  google: 'https://lh3.googleusercontent.com',
  github: 'https://avatars.githubusercontent.com',
  microsoft: null,
} as const

/** Origin of a configured URL, or null. */
const originOf = (u?: string) => (u ? new URL(u).origin : null)

export function buildCsp(nonce: string, dev: boolean) {
  const c = getConfig()
  const relay = c.reconsumet.relayUrl
  const analytics = originOf(c.site.analyticsScriptUrl)
  const logo = originOf(c.site.logoUrl)
  const avatars = Object.entries(AVATAR_ORIGINS).flatMap(([id, o]) => (o && id in c.auth.social ? [o] : []))
  const https = c.site.url.startsWith('https://')
  const src = (...xs: (string | null | false)[]) => xs.filter(Boolean).join(' ')
  return [
    `default-src 'self'`,
    // strict-dynamic: only scripts carrying this request's nonce (Next adds it to its own) and what they load
    `script-src ${src(`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`, dev && `'unsafe-eval'`)}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${src(`'self'`, 'data:', 'blob:', logo, ...avatars)}`,
    `font-src 'self'`,
    `connect-src ${src(`'self'`, relay, analytics, dev && 'ws:')}`,
    `media-src ${src(`'self'`, 'blob:', relay)}`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    https && 'upgrade-insecure-requests',
  ]
    .filter(Boolean)
    .join('; ')
}

export function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  // next/image accepts any https host at build time (next.config.ts); only IMAGE_HOSTS may be fetched at runtime.
  if (pathname === '/_next/image') {
    const raw = searchParams.get('url') ?? ''
    if (!raw.startsWith('/')) {
      let host = ''
      try {
        host = new URL(raw).hostname
      } catch {}
      const c = getConfig()
      const logoHost = c.site.logoUrl ? new URL(c.site.logoUrl).hostname : null
      if (!c.imageHosts.includes(host) && host !== logoHost)
        return new NextResponse('image host not allowed', { status: 400 })
    }
    return NextResponse.next()
  }

  const nonce = btoa(crypto.randomUUID())
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'development')
  const reqHeaders = new Headers(req.headers)
  reqHeaders.set('x-nonce', nonce)
  reqHeaders.set('content-security-policy', csp)
  const res = NextResponse.next({ request: { headers: reqHeaders } })
  res.headers.set('content-security-policy', csp)
  res.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  res.headers.set('x-content-type-options', 'nosniff')
  res.headers.set('x-frame-options', 'DENY')
  res.headers.set(
    'permissions-policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  )
  if (getConfig().site.url.startsWith('https://'))
    res.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains')
  return res
}

export const config = {
  // everything except static build assets; /_next/image is included for the host check above
  matcher: ['/((?!_next/static|favicon.ico).*)'],
}
