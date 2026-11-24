import 'server-only'
import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { haveIBeenPwned, twoFactor } from 'better-auth/plugins'
import { getConfig } from '@/config'
import { getDb } from './db'
import { sendMail } from './mail'

// The client-IP preload (server/client-ip.mjs) writes this header; clients can't set it.
export const CLIENT_IP = 'x-site-client-ip'

export function createAuth() {
  const c = getConfig()
  const { smtp, site } = c
  const s = c.auth.social
  if (c.auth.email && !smtp)
    console.warn('[auth] email sign-up without SMTP: emails are not verified and passwords cannot be reset')

  return betterAuth({
    appName: site.name,
    baseURL: site.url,
    secret: c.auth.secret,
    database: prismaAdapter(getDb(), { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: c.auth.email,
      requireEmailVerification: Boolean(smtp),
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: smtp
        ? ({ user, url }) =>
            sendMail(user.email, 'Reset your password', [
              'Someone asked to reset the password of your account.',
              `Set a new one here (the link works for one hour): ${url}`,
              'If that wasn’t you, ignore this email.',
            ])
        : undefined,
    },
    emailVerification: smtp
      ? {
          sendOnSignUp: true,
          autoSignInAfterVerification: true,
          sendVerificationEmail: ({ user, url }) =>
            sendMail(user.email, 'Confirm your email', [`Confirm your email address: ${url}`]),
        }
      : undefined,
    socialProviders: {
      ...(s.discord && { discord: s.discord }),
      ...(s.google && { google: { ...s.google, prompt: 'select_account' as const } }),
      ...(s.github && { github: s.github }),
      ...(s.microsoft && { microsoft: { ...s.microsoft, tenantId: c.auth.microsoftTenantId } }),
    },
    // Defaults kept on purpose: implicit linking only when the provider says the email is verified *and* the local
    // email is verified; no trusted providers.
    account: { accountLinking: { enabled: true } },
    user: {
      changeEmail: { enabled: true, updateEmailWithoutVerification: !smtp },
      deleteUser: { enabled: true },
    },
    rateLimit: { storage: 'database' },
    advanced: {
      ipAddress: { ipAddressHeaders: [CLIENT_IP] },
      useSecureCookies: site.url.startsWith('https://'),
    },
    databaseHooks:
      smtp && c.auth.newSignInEmail
        ? {
            session: {
              create: {
                after: async (session) => {
                  const user = await getDb().user.findUnique({ where: { id: session.userId } })
                  if (user)
                    await sendMail(user.email, 'New sign-in', [
                      `Your account was just signed in to from: ${session.userAgent ?? 'an unknown browser'}.`,
                      'If that wasn’t you, change your password and sign out other sessions in Settings → Security.',
                    ])
                },
              },
            },
          }
        : undefined,
    plugins: [
      passkey({ rpID: new URL(site.url).hostname, rpName: site.name, origin: site.url }),
      twoFactor({
        issuer: site.name,
        otpOptions: smtp
          ? {
              sendOTP: ({ user, otp }) =>
                sendMail(user.email, 'Your sign-in code', [`Your code: ${otp}`, 'It expires in 3 minutes.']),
            }
          : undefined,
      }),
      haveIBeenPwned({ enabled: c.auth.breachedPasswordCheck }),
      nextCookies(), // must stay last: lets server actions set auth cookies
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
let auth: Auth | undefined
/** Created on first use, so `next build` never needs runtime env. */
export const getAuth = () => (auth ??= createAuth())
