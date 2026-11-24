import 'server-only'
import { type Config, parseConfig } from './schema'

export { type Config, enabledMethods, type SocialId } from './schema'

let cached: Config | undefined

/** Server-only settings, parsed once from env. Read at request time so one built image works for everyone. */
export function getConfig(): Config {
  cached ??= parseConfig(process.env)
  return cached
}

/** The only settings that may be passed to client components. */
export function publicConfig() {
  return getConfig().site
}
export type PublicConfig = ReturnType<typeof publicConfig>
