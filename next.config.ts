import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Any https host here; src/proxy.ts narrows it to IMAGE_HOSTS at runtime, so one built image serves any config.
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
}

export default config
