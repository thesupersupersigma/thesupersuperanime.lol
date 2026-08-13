import type { OverallStatus, ServiceGroup, ServiceStatus } from "./status-types";

/**
 * Pure decision rules for the status page. Split out of status.ts so they can
 * be tested without a database or a network.
 */

export interface PingOutcome {
  success: boolean;
  latencyMs: number;
  /** Misconfiguration rather than an unhealthy upstream. */
  configError?: boolean;
}

/**
 * Map a ping result to a service status.
 *
 * `configError` reads "unknown", NOT "outage". A missing SCRAPER_API_URL is a
 * deployment mistake, and reporting it as an outage is what trained everyone to
 * ignore this row: /status showed "Major Outage" permanently for a service that
 * wasn't even in the pipeline. "unknown" also means no incident is opened and
 * no StatusCheck row is written, so a config mistake can't be baked into the
 * uptime percentage forever.
 */
export function classifyPing(r: PingOutcome, degradedLatencyMs: number): ServiceStatus {
  if (r.configError) return "unknown";
  if (!r.success) return "outage";
  if (r.latencyMs > degradedLatencyMs) return "degraded";
  return "operational";
}

/**
 * Overall banner status — INFRASTRUCTURE services only.
 *
 * The "providers" group is fed by ProviderStatus rows from the legacy core-dist
 * registry (gogoanime / aniwave, whose domains died in 2024). Those aren't part
 * of the video pipeline at all, but they were voting, so `/status` and
 * `/api/status` reported "Major Outage" permanently no matter how healthy the
 * site actually was.
 */
export function computeOverallStatus(
  services: { group: ServiceGroup; status: ServiceStatus }[],
): OverallStatus {
  const infra = services.filter((s) => s.group === "infrastructure");
  if (infra.some((s) => s.status === "outage")) return "outage";
  if (infra.some((s) => s.status === "degraded")) return "degraded";
  return "operational";
}
