// Preloaded with `node --import ./server/client-ip.mjs server.js` (Dockerfile; `pnpm dev` runs without it). Next.js keeps a client-sent
// X-Forwarded-For and drops the socket address, so before Next sees a request we work out the viewer's IP here, the
// same way RECONSUMET.TS does, and put it in one header that always overwrites whatever the client sent.
// The forwarded header is only believed when the direct peer is in TRUSTED_PROXIES.
import http from 'node:http'
import { BlockList, isIP } from 'node:net'

export const CLIENT_IP_HEADER_OUT = 'x-site-client-ip'

/** "10.0.0.0/8, ::1" → BlockList */
export function trustList(spec) {
  const list = new BlockList()
  for (const raw of (spec ?? '').split(',')) {
    const [addr = '', bits] = raw.trim().split('/')
    const family = isIP(addr)
    if (!family) continue
    const type = family === 4 ? 'ipv4' : 'ipv6'
    if (bits) list.addSubnet(addr, Number(bits), type)
    else list.addAddress(addr, type)
  }
  return list
}

const bare = (ip) => ip.trim().replace(/^::ffff:(?=\d+\.)/, '')
const isTrusted = (list, ip) => {
  const family = isIP(ip)
  return family !== 0 && list.check(ip, family === 4 ? 'ipv4' : 'ipv6')
}

/** Rightmost forwarded hop that isn't a trusted proxy; the socket address when the peer isn't trusted. */
export function clientIp(remote, forwarded, trusted) {
  let ip = bare(remote)
  if (!forwarded || !isTrusted(trusted, ip)) return ip
  const hops = String(forwarded)
    .split(',')
    .map(bare)
    .filter((h) => isIP(h))
  while (hops.length) {
    ip = hops.pop()
    if (!isTrusted(trusted, ip)) return ip
  }
  return ip
}

if (!globalThis.__siteClientIpHook) {
  globalThis.__siteClientIpHook = true
  const trusted = trustList(process.env.TRUSTED_PROXIES)
  const inHeader = (process.env.CLIENT_IP_HEADER || 'x-forwarded-for').toLowerCase()
  const emit = http.Server.prototype.emit
  http.Server.prototype.emit = function (event, req, ...rest) {
    if (event === 'request' && req?.headers) {
      const fwd = req.headers[inHeader]
      req.headers[CLIENT_IP_HEADER_OUT] = clientIp(
        req.socket?.remoteAddress ?? '',
        Array.isArray(fwd) ? fwd.join(',') : fwd,
        trusted,
      )
    }
    return emit.call(this, event, req, ...rest)
  }
}
