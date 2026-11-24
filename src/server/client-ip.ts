import 'server-only'
import { headers } from 'next/headers'
import { CLIENT_IP } from './auth'

/**
 * The viewer's IP, worked out by server/client-ip.mjs from the socket + TRUSTED_PROXIES / CLIENT_IP_HEADER.
 * null under `pnpm dev`, which runs without that preload.
 */
export async function clientIp(): Promise<string | null> {
  return (await headers()).get(CLIENT_IP)
}
