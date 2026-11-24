import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs preload, no types
import { clientIp, trustList } from './client-ip.mjs'

describe('clientIp', () => {
  const trusted = trustList('10.0.0.0/8, ::1')
  it('ignores forwarded headers from untrusted peers', () => {
    expect(clientIp('203.0.113.9', '1.2.3.4', trusted)).toBe('203.0.113.9')
  })
  it('takes the rightmost untrusted hop behind a trusted proxy', () => {
    expect(clientIp('10.0.0.2', '6.6.6.6, 198.51.100.7, 10.0.0.5', trusted)).toBe('198.51.100.7')
  })
  it('unwraps IPv4-mapped IPv6 and handles a missing header', () => {
    expect(clientIp('::ffff:10.0.0.2', undefined, trusted)).toBe('10.0.0.2')
  })
  it('trusts nothing by default', () => {
    expect(clientIp('10.0.0.2', '1.2.3.4', trustList(''))).toBe('10.0.0.2')
  })
})
