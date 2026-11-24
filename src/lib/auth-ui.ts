/** Only same-site paths, so `?next=` can't send people to another site. */
export function safeNext(v: string | null | undefined, fallback = '/') {
  return v?.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : fallback
}

type AuthError = { code?: string; message?: string; status?: number } | null | undefined

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'That email and password don’t match.',
  EMAIL_NOT_VERIFIED: 'Confirm your email first: we sent you a link.',
  USER_ALREADY_EXISTS: 'There’s already an account with this email. Sign in instead.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'There’s already an account with this email. Sign in instead.',
  PASSWORD_TOO_SHORT: 'Use at least 8 characters.',
  PASSWORD_TOO_LONG: 'That password is too long.',
  PASSWORD_COMPROMISED: 'This password showed up in a data breach. Pick a different one.',
  INVALID_CODE: 'That code isn’t right. Check it and try again.',
  INVALID_BACKUP_CODE: 'That backup code isn’t right, or it was already used.',
  OTP_HAS_EXPIRED: 'That code expired. Send a new one.',
  INVALID_TOKEN: 'This link is invalid or has expired.',
  SESSION_NOT_FRESH: 'For your safety, sign in again before changing this.',
  SESSION_EXPIRED: 'For your safety, sign in again before changing this.',
  INVALID_PASSWORD: 'That password isn’t right.',
  CREDENTIAL_ACCOUNT_NOT_FOUND: 'Your account has no password.',
}

/** Plain-English message for a Better Auth error (falls back to its own message). */
export function errorText(e: AuthError) {
  if (!e) return null
  if (e.status === 429) return 'Too many attempts. Wait a minute and try again.'
  return (e.code && MESSAGES[e.code]) || e.message || 'Something went wrong. Try again.'
}
