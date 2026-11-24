'use client'
import { useEffect } from 'react'
import { mergeGuestData } from '@/app/actions'
import { useToast } from '@/components/ui/toast'
import { clearGuest, hasGuestData, readGuest } from '@/lib/guest'

/** After any sign-in (password, social, passkey), moves this browser's guest data into the account once. */
export function GuestMerge() {
  const toast = useToast()
  useEffect(() => {
    const data = readGuest()
    if (!hasGuestData(data)) return
    mergeGuestData(data)
      .then((r) => {
        if (!r.ok) return
        clearGuest()
        toast({ text: 'Your watch history from this browser is now in your account' })
      })
      .catch(() => {}) // kept locally; the next page load tries again
  }, [toast])
  return null
}
