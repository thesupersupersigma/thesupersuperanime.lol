/**
 * Referer / Origin spoofing for the video proxy.
 *
 * Upstream CDNs hotlink-protect their segments, so the proxy sends a Referer
 * they expect. Split out of the route so the matching rules are testable
 * without pulling in next/server.
 */
/** Hosts that want a kwik.cx referer, matched on the registrable domain. */
const KWIK_HOSTS = ["kwik.cx", "kwik.si", "owocdn.com", "padorupado.ru"];
/** Fallback referer when the scraper supplied none. */
const DEFAULT_REFERER = "https://megaplay.buzz/";

function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith("." + domain);
}

/**
 * Pick the Referer to send upstream. The scraper's stored value wins; the
 * host-specific override only applies when it gave us nothing.
 */
export function normaliseReferer(storedReferer: string, target: URL): string {
  if (storedReferer) {
    return storedReferer.endsWith("/") ? storedReferer : storedReferer + "/";
  }
  if (KWIK_HOSTS.some((d) => hostMatches(target.hostname, d))) {
    return "https://kwik.cx/";
  }
  return DEFAULT_REFERER;
}

/** Valid origin serialisation (scheme + host + port, never a path). */
export function toOrigin(referer: string): string {
  try {
    return new URL(referer).origin;
  } catch {
    return referer.replace(/\/$/, "");
  }
}
