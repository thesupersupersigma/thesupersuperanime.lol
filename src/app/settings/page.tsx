import { cookies } from 'next/headers'
import { getConfig } from '@/config'
import { titleLangOf } from '@/lib/title'
import { AccountForms } from './account-forms'

export default async function AccountSettingsPage() {
  const jar = await cookies()
  const motion = jar.get('motion')?.value ?? 'system'
  return (
    <AccountForms
      canVerifyEmail={Boolean(getConfig().smtp)}
      motion={motion}
      titleLang={titleLangOf(jar.get('title')?.value)}
    />
  )
}
