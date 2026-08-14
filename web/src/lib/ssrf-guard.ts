// SSRF guard for the video/segment proxy.
//
// /api/proxy/[token] decrypts a stored URL and streams the body back. Those
// URLs come from upstream HLS playlists, which are rewritten line by line
// (route.ts tokenizes every non-comment line verbatim), so a hostile or
// compromised CDN can put an arbitrary target in front of this fetch.
//
// Approach:
//   1. http/https only.
//   2. Literal-IP hosts are checked directly.
//   3. HOSTNAMES ARE RESOLVED and every returned address is checked. This is
//      the part that was missing: the old guard inspected only the literal
//      hostname and fell through to `return false // allowed`, so
//      `http://rebind.attacker.tld/` with an A record of 169.254.169.254
//      sailed past, as did `localhost.` (trailing dot, matching neither the
//      string compare nor either literal parser) and `host.docker.internal` —
//      the very hostname this proxy's own comments cite as the thing it exists
//      to hide.
//   4. A name that resolves to BOTH a public and a private address is blocked;
//      it must not slip through on the public one.
//
// Ranges are expressed once and loaded into net.BlockList, which does the
// bit-masking. This is a strict widening of the old hand-rolled checks: it adds
// IETF protocol assignments, TEST-NET-1/2/3, benchmarking, multicast, reserved,
// NAT64, documentation and discard-only ranges that were previously allowed.
//
// RESIDUAL RISK, documented rather than silently ignored: DNS rebinding
// (TOCTOU). The address resolved here and the address the subsequent fetch
// connects to are two independent lookups, so a hostile resolver can answer
// public here and private there. Closing that needs connection-level IP pinning
// via a custom undici dispatcher, which would mean re-plumbing the streaming
// path — deliberately out of scope for this pass. The literal-IP, redirect and
// plain DNS-to-private vectors are closed.

import net from "node:net";
import dns from "node:dns/promises";

/** `dns.lookup(host, { all: true })`-compatible resolver. Injectable for tests. */
export type LookupFn = (
  hostname: string,
  options: { all: true; verbatim?: boolean },
) => Promise<{ address: string; family: number }[]>;

const blocklist = new net.BlockList();
// -- IPv4 --
blocklist.addSubnet("0.0.0.0", 8, "ipv4"); // "this host" / 0.0.0.0
blocklist.addSubnet("10.0.0.0", 8, "ipv4"); // RFC1918 private
blocklist.addSubnet("100.64.0.0", 10, "ipv4"); // CGNAT / shared
blocklist.addSubnet("127.0.0.0", 8, "ipv4"); // loopback
blocklist.addSubnet("169.254.0.0", 16, "ipv4"); // link-local — CLOUD INSTANCE METADATA
blocklist.addSubnet("172.16.0.0", 12, "ipv4"); // RFC1918 private
blocklist.addSubnet("192.0.0.0", 24, "ipv4"); // IETF protocol assignments
blocklist.addSubnet("192.0.2.0", 24, "ipv4"); // TEST-NET-1
blocklist.addSubnet("192.168.0.0", 16, "ipv4"); // RFC1918 private
blocklist.addSubnet("198.18.0.0", 15, "ipv4"); // benchmarking
blocklist.addSubnet("198.51.100.0", 24, "ipv4"); // TEST-NET-2
blocklist.addSubnet("203.0.113.0", 24, "ipv4"); // TEST-NET-3
blocklist.addSubnet("224.0.0.0", 4, "ipv4"); // multicast
blocklist.addSubnet("240.0.0.0", 4, "ipv4"); // reserved (incl. 255.255.255.255)
// -- IPv6 --
blocklist.addAddress("::1", "ipv6"); // loopback
blocklist.addAddress("::", "ipv6"); // unspecified
blocklist.addSubnet("fc00::", 7, "ipv6"); // unique-local (incl. AWS fd00:ec2::254 IMDS)
blocklist.addSubnet("fe80::", 10, "ipv6"); // link-local
blocklist.addSubnet("64:ff9b::", 96, "ipv6"); // NAT64 (embeds a v4 address)
blocklist.addSubnet("2001:db8::", 32, "ipv6"); // documentation
blocklist.addSubnet("100::", 64, "ipv6"); // discard-only
//
// DO NOT add ::ffff:0:0/96 here. net.BlockList normalises IPv4 into its
// IPv4-mapped form internally, so that subnet matches EVERY IPv4 address and
// silently blocks all public traffic. check() already resolves an IPv4-mapped
// literal — dotted (::ffff:169.254.169.254) or hex (::ffff:a9fe:a9fe) — against
// the IPv4 rules above, so mapped-address evasion is covered without it.

/**
 * True when `ip` (a literal IPv4/IPv6 string) is in a blocked range.
 * Anything that doesn't parse as an IP is treated as blocked.
 */
export function isBlockedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return blocklist.check(ip, "ipv4");
  if (family === 6) return blocklist.check(ip, "ipv6");
  return true;
}

export interface ProxyTargetVerdict {
  blocked: boolean;
  /** Why it was blocked — for the log line, never surfaced to the client. */
  reason?: string;
  /** Vetted addresses, when allowed. */
  addresses?: string[];
}

/**
 * Decide whether `rawUrl` may be fetched server-side.
 *
 * `lookup` is injectable (same contract as `dns.lookup(host, { all: true })`)
 * so the resolver-dependent branches — a name resolving to a private address,
 * or to a public AND a private one — are testable without real DNS.
 */
export async function checkProxyTarget(
  rawUrl: string,
  { lookup = dns.lookup as unknown as LookupFn }: { lookup?: LookupFn } = {},
): Promise<ProxyTargetVerdict> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { blocked: true, reason: "malformed url" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { blocked: true, reason: `scheme ${parsed.protocol} not allowed` };
  }

  // IPv6 literals arrive bracket-wrapped from the URL parser.
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!host) return { blocked: true, reason: "empty host" };

  // Literal IP host — no DNS needed. The WHATWG parser has already normalised
  // octal/hex/integer IPv4 forms to dotted decimal by this point.
  if (net.isIP(host)) {
    if (isBlockedIp(host)) {
      return { blocked: true, reason: `host ${host} is in a blocked range` };
    }
    return { blocked: false, addresses: [host] };
  }

  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch {
    // Fail closed: an unresolvable host isn't fetchable anyway, and treating a
    // resolver error as "allowed" would reopen the hole this closes.
    return { blocked: true, reason: `could not resolve host ${host}` };
  }

  if (!addrs || addrs.length === 0) {
    return { blocked: true, reason: `host ${host} resolved to no addresses` };
  }

  for (const { address } of addrs) {
    if (isBlockedIp(address)) {
      return { blocked: true, reason: `host ${host} resolves to ${address}, which is blocked` };
    }
  }

  return { blocked: false, addresses: addrs.map((a) => a.address) };
}

/**
 * Boolean form of {@link checkProxyTarget} — true means BLOCKED.
 *
 * NOTE: this is now async. It used to be synchronous; a caller that forgets to
 * await gets a Promise, which is always truthy, so the request is blocked
 * rather than allowed. That fails closed, but it will look like broken
 * playback — await it.
 */
export async function isBlockedProxyTarget(
  rawUrl: string,
  opts?: { lookup?: LookupFn },
): Promise<boolean> {
  return (await checkProxyTarget(rawUrl, opts)).blocked;
}
