// Every setting comes from env (see .env.example). Empty strings count as unset, so a copied .env.example works.
import { z } from 'zod'

const opt = <T extends z.ZodType>(t: T) => z.preprocess((v) => (v === '' ? undefined : v), t.optional())
const str = opt(z.string())
const url = opt(z.url({ protocol: /^https?$/ }))
const bool = (def: boolean) => opt(z.enum(['true', 'false'])).transform((v) => (v === undefined ? def : v === 'true'))
const list = (def: string) =>
  opt(z.string()).transform((v) =>
    (v ?? def)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
const origin = (v: string) => v.replace(/\/+$/, '')

export const envSchema = z.object({
  SITE_URL: url.transform((v) => origin(v ?? 'http://localhost:3000')),
  SITE_NAME: str.transform((v) => v ?? 'Anime'),
  SITE_DESCRIPTION: str,
  SITE_LOGO_URL: url,
  DISCORD_INVITE_URL: url,
  ANALYTICS_SCRIPT_URL: url,

  DATABASE_URL: z.string({ error: 'required' }).min(1, 'required'),

  RECONSUMET_API_URL: url.transform((v) => origin(v ?? 'http://localhost:8080')),
  RECONSUMET_API_KEY: str,
  RELAY_PUBLIC_URL: url.transform((v) => origin(v ?? 'http://localhost:8081')),
  HOME_ANILIST_IDS: list('16498,1535,5114,113415,21,154587')
    .transform((xs) => xs.map(Number))
    .pipe(z.array(z.number().int().positive())),
  IMAGE_HOSTS: list('s4.anilist.co,cdn.myanimelist.net'),

  BETTER_AUTH_SECRET: z.string({ error: 'required' }).min(32, 'must be at least 32 characters'),
  TRUSTED_PROXIES: str,
  CLIENT_IP_HEADER: str,

  AUTH_EMAIL_ALLOW_UNVERIFIED: bool(false),
  AUTH_BREACHED_PASSWORD_CHECK: bool(true),
  AUTH_NEW_SIGNIN_EMAIL: bool(false),
  DISCORD_CLIENT_ID: str,
  DISCORD_CLIENT_SECRET: str,
  GOOGLE_CLIENT_ID: str,
  GOOGLE_CLIENT_SECRET: str,
  GITHUB_CLIENT_ID: str,
  GITHUB_CLIENT_SECRET: str,
  MICROSOFT_CLIENT_ID: str,
  MICROSOFT_CLIENT_SECRET: str,
  MICROSOFT_TENANT_ID: str.transform((v) => v ?? 'common'),

  SMTP_HOST: str,
  SMTP_PORT: opt(z.coerce.number().int().positive()),
  SMTP_SECURE: opt(z.enum(['true', 'false'])),
  SMTP_USER: str,
  SMTP_PASS: str,
  SMTP_FROM: str,
})

export const SOCIAL = ['discord', 'google', 'github', 'microsoft'] as const
export type SocialId = (typeof SOCIAL)[number]

export type Config = ReturnType<typeof parseConfig>

/** Parses env; throws one error listing every bad variable. */
export function parseConfig(env: Record<string, string | undefined>) {
  const r = envSchema.safeParse(env)
  const problems = r.success ? [] : r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
  if (r.success) {
    const e = r.data
    for (const id of SOCIAL) {
      const k = id.toUpperCase() as Uppercase<SocialId>
      if (!e[`${k}_CLIENT_ID` as const] !== !e[`${k}_CLIENT_SECRET` as const])
        problems.push(`  ${k}_CLIENT_ID / ${k}_CLIENT_SECRET: set both or neither`)
    }
    if (e.SMTP_HOST && !e.SMTP_FROM) problems.push('  SMTP_FROM: required when SMTP_HOST is set')
  }
  if (!r.success || problems.length) throw new Error(`Invalid configuration:\n${problems.join('\n')}`)
  const e = r.data

  const smtp = e.SMTP_HOST
    ? {
        host: e.SMTP_HOST,
        port: e.SMTP_PORT ?? 587,
        secure: e.SMTP_SECURE ? e.SMTP_SECURE === 'true' : (e.SMTP_PORT ?? 587) === 465,
        user: e.SMTP_USER,
        pass: e.SMTP_PASS,
        from: e.SMTP_FROM!,
      }
    : null
  const social = Object.fromEntries(
    SOCIAL.flatMap((id) => {
      const k = id.toUpperCase() as Uppercase<SocialId>
      const clientId = e[`${k}_CLIENT_ID`]
      const clientSecret = e[`${k}_CLIENT_SECRET`]
      return clientId && clientSecret ? [[id, { clientId, clientSecret }]] : []
    }),
  ) as Partial<Record<SocialId, { clientId: string; clientSecret: string }>>

  return {
    site: {
      url: e.SITE_URL,
      name: e.SITE_NAME,
      description: e.SITE_DESCRIPTION,
      logoUrl: e.SITE_LOGO_URL,
      discordInviteUrl: e.DISCORD_INVITE_URL,
      analyticsScriptUrl: e.ANALYTICS_SCRIPT_URL,
    },
    databaseUrl: e.DATABASE_URL,
    reconsumet: { url: e.RECONSUMET_API_URL, apiKey: e.RECONSUMET_API_KEY, relayUrl: e.RELAY_PUBLIC_URL },
    homeAnilistIds: e.HOME_ANILIST_IDS,
    imageHosts: e.IMAGE_HOSTS,
    auth: {
      secret: e.BETTER_AUTH_SECRET,
      email: Boolean(smtp) || e.AUTH_EMAIL_ALLOW_UNVERIFIED,
      breachedPasswordCheck: e.AUTH_BREACHED_PASSWORD_CHECK,
      newSignInEmail: e.AUTH_NEW_SIGNIN_EMAIL,
      social,
      microsoftTenantId: e.MICROSOFT_TENANT_ID,
    },
    smtp,
  }
}

/** The login methods the sign-in page may show. */
export function enabledMethods(c: Config) {
  return { email: c.auth.email, social: SOCIAL.filter((id) => c.auth.social[id]) }
}
