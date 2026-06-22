// Dependency-free SSRF guard for the video/segment proxy.
//
// Goal: block requests aimed at internal/private/reserved network targets while
// still allowing legit CDNs that serve from PUBLIC IP-literal hosts. So this is
// deliberately NOT a host allowlist and it does NOT block public IPs — it only
// rejects loopback/private/link-local/reserved ranges (plus `localhost`).
//
// IPv4 host literals reaching us via `new URL(...).hostname` are already
// normalised to canonical dotted-decimal by the WHATWG URL parser (octal/hex/
// integer forms collapse to a.b.c.d), so a simple dotted-quad parse is enough.
// IPv6 literals arrive bracket-wrapped and hex-serialised; we expand them to 16
// bytes and check the relevant prefixes, including IPv4-mapped forms.

function parseIPv4(s: string): number[] | null {
  const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  for (const p of parts) if (p > 255) return null;
  return parts;
}

function ipv4Blocked(a: number, b: number, c: number, d: number): boolean {
  if (a === 127) return true; // 127.0.0.0/8  loopback
  if (a === 10) return true; // 10.0.0.0/8   private
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. 169.254.169.254 metadata)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT/shared
  if (a === 0) return true; // 0.0.0.0/8    "this" network / reserved
  void c;
  void d;
  return false;
}

// Expand an IPv6 literal (no surrounding brackets) to its 16 bytes, or null if
// it isn't a parseable IPv6 address. Handles `::` compression and a trailing
// embedded IPv4 (e.g. `::ffff:1.2.3.4`).
function parseIPv6ToBytes(addr: string): number[] | null {
  if (!addr.includes(":")) return null;

  // Drop any zone id (`fe80::1%eth0`).
  const zoneIdx = addr.indexOf("%");
  if (zoneIdx !== -1) addr = addr.slice(0, zoneIdx);

  // Fold a trailing embedded IPv4 into two hex hextets.
  if (addr.includes(".")) {
    const lc = addr.lastIndexOf(":");
    if (lc === -1) return null;
    const v4 = parseIPv4(addr.slice(lc + 1));
    if (!v4) return null;
    const h1 = ((v4[0] << 8) | v4[1]).toString(16);
    const h2 = ((v4[2] << 8) | v4[3]).toString(16);
    addr = addr.slice(0, lc + 1) + h1 + ":" + h2;
  }

  const halves = addr.split("::");
  if (halves.length > 2) return null;

  const head = halves[0].length ? halves[0].split(":") : [];
  const tail = halves.length === 2 ? (halves[1].length ? halves[1].split(":") : []) : null;

  let groups: string[];
  if (tail === null) {
    if (head.length !== 8) return null;
    groups = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tail];
  }

  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    const val = parseInt(g, 16);
    bytes.push((val >> 8) & 0xff, val & 0xff);
  }
  return bytes.length === 16 ? bytes : null;
}

function ipv6Blocked(b: number[]): boolean {
  const allZero = b.every((x) => x === 0);
  if (allZero) return true; // ::  unspecified
  if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return true; // ::1 loopback
  if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7  unique-local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) forms: check the
  // embedded IPv4 against the v4 rules so a mapped private address can't slip by.
  const v4mapped = b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff;
  const v4compat = b.slice(0, 12).every((x) => x === 0) && !(b[12] === 0 && b[13] === 0 && b[14] === 0);
  if (v4mapped || v4compat) return ipv4Blocked(b[12], b[13], b[14], b[15]);

  return false;
}

/**
 * Returns true when `rawUrl` should be BLOCKED from being proxied: it's
 * unparseable, not http(s), or points at an internal/private/reserved target.
 * Public hostnames and public IP literals return false (allowed).
 */
export function isBlockedProxyTarget(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return true;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;

  // IPv6 literals arrive bracket-wrapped (e.g. `[::1]`).
  if (host.startsWith("[") && host.endsWith("]")) {
    const v6 = parseIPv6ToBytes(host.slice(1, -1));
    if (v6) return ipv6Blocked(v6);
    return false;
  }

  const v4 = parseIPv4(host);
  if (v4) return ipv4Blocked(v4[0], v4[1], v4[2], v4[3]);

  // Non-bracketed but still possibly an IPv6 literal in some edge serialisations.
  const v6 = parseIPv6ToBytes(host);
  if (v6) return ipv6Blocked(v6);

  // Public hostname or public IP literal — allowed.
  return false;
}
