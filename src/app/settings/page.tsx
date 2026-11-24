import { cookies } from 'next/headers'
import { getConfig } from '@/config'
import { AccountForms } from './account-forms'

export default async function AccountSettingsPage() {
  const motion = (await cookies()).get('motion')?.value ?? 'system'
  return <AccountForms canVerifyEmail={Boolean(getConfig().smtp)} motion={motion} />
}
