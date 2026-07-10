import { NextRequest } from "next/server";

// Loose shape checks — enough to reject obvious garbage, not exhaustive
// validation. IPv4: four dot-separated 1-3 digit groups. IPv6: hex groups
// separated by colons (covers `::` shorthand and IPv4-mapped forms).
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+(:(\d{1,3}\.){3}\d{1,3})?$/;

/**
 * Extract the client IP from proxy-forwarded headers.
 *
 * Trusts whatever the reverse proxy (Traefik) forwards in `x-forwarded-for`
 * (first entry) or `x-real-ip` — so this is only as reliable as the proxy's
 * header-trust configuration. If the proxy passes client-supplied headers
 * through unstripped, the value is spoofable; that's a known limitation this
 * function cannot solve from application code. Returns "unknown" when no
 * header is present or the value doesn't look like a plausible IPv4/IPv6
 * address, so callers degrade to their non-IP-bound behavior instead of
 * binding to garbage.
 */
export function getClientIp(req: NextRequest): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip")?.trim() ??
    "";
  if (!ip) return "unknown";
  if (IPV4_RE.test(ip)) return ip;
  if (ip.includes(":") && IPV6_RE.test(ip)) return ip;
  return "unknown";
}
