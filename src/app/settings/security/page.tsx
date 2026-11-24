import { enabledMethods, getConfig } from '@/config'
import { SecuritySettings } from './security-settings'

export default function SecurityPage() {
  const c = getConfig()
  return <SecuritySettings social={enabledMethods(c).social} emailCodes={Boolean(c.smtp)} />
}
