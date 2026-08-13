import { db } from "@/lib/db";
import { classifyPing, computeOverallStatus } from "@/lib/status-rules";

// ── Shared status logic ───────────────────────────────────────────────────────
// Two code paths:
//   - runStatusChecks()   — live pings + persistence (StatusCheck/incident writes).
//                           Cron-only: GET /api/cron/status-check, every 5 min.
//   - getStatusSnapshot() — READ-ONLY assembly from persisted data, no pings/writes.
//                           Public reads: GET /api/status + the /status page, so
//                           hammering them can't amplify load or pollute history.

export type { ServiceStatus, OverallStatus, ServiceGroup } from "@/lib/status-types";
import type { ServiceStatus, OverallStatus, ServiceGroup } from "@/lib/status-types";

export interface StatusService {
  id: string;
  name: string;
  group: ServiceGroup;
  status: ServiceStatus;
  latencyMs: number | null;
  uptimePercent: number;
  lastChecked: string; // ISO
  incident?: { startedAt: string; description: string };
  // Oldest → newest, padded to HISTORY_LIMIT. `null` = no data for that slot.
  history: (boolean | null)[];
}

export interface StatusResult {
  services: StatusService[];
  overallStatus: OverallStatus;
  lastUpdated: string; // ISO
  incidents: { opened: number; resolved: number };
}

const HISTORY_LIMIT = 90;
const DEGRADED_LATENCY_MS = 2000; // a successful-but-slow ping is "degraded"
const DB_MAX_MS = 3000; // db.user.count() must finish under this to count as up
const PING_TIMEOUT_MS = 5000;
const SITE_URL = "https://www.thesupersuperanime.lol";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown error";
}

// ── Infrastructure live pings ─────────────────────────────────────────────────

interface PingResult {
  success: boolean;
  latencyMs: number;
  error?: string;
  /** Misconfiguration rather than an unhealthy upstream — reads "unknown", never opens an incident. */
  configError?: boolean;
}

interface InfraDef {
  id: string;
  name: string;
  ping: () => Promise<PingResult>;
}

// Site — any response (incl. 401) means the site is serving requests.
async function pingSite(): Promise<PingResult> {
  const start = Date.now();
  try {
    await fetch(`${SITE_URL}/api/auth/me`, {
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    return { success: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { success: false, latencyMs: Date.now() - start, error: errMsg(e) };
  }
}

// Neon database — measure a trivial query; up only if it completes under DB_MAX_MS.
async function pingDatabase(): Promise<PingResult> {
  const start = Date.now();
  try {
    await db.user.count();
    const latencyMs = Date.now() - start;
    return {
      success: latencyMs < DB_MAX_MS,
      latencyMs,
      error: latencyMs < DB_MAX_MS ? undefined : `Query took ${latencyMs}ms`,
    };
  } catch (e) {
    return { success: false, latencyMs: Date.now() - start, error: errMsg(e) };
  }
}

// Scraper API — any response to its health endpoint counts as healthy.
//
// This pings SCRAPER_API_URL: the service /api/source actually calls. It used
// to ping `ANIVEXA_API_URL || "http://64.181.222.197:4000"` — a variable no
// other code reads, defaulting to a hardcoded IP for a VM that no longer
// exists. The two had ZERO overlap, so /status reported a permanent outage for
// a service that isn't in the pipeline while a real scraper outage produced no
// signal at all.
//
// There is deliberately no fallback host: an unset variable is a CONFIG error,
// not an outage. Reporting it as an outage is what trained everyone to ignore
// this row.
async function pingScraper(): Promise<PingResult> {
  const start = Date.now();
  const raw = process.env.SCRAPER_API_URL;
  if (!raw) {
    return {
      success: false,
      latencyMs: 0,
      error: "SCRAPER_API_URL is not configured",
      configError: true,
    };
  }
  const base = raw.replace(/\/$/, "");
  try {
    await fetch(`${base}/health`, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    return { success: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { success: false, latencyMs: Date.now() - start, error: errMsg(e) };
  }
}

// AniList GraphQL — healthy only on a 2xx response.
async function pingAnilist(): Promise<PingResult> {
  const start = Date.now();
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ Page(page:1,perPage:1) { media { id } } }" }),
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    return {
      success: res.ok,
      latencyMs: Date.now() - start,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e) {
    return { success: false, latencyMs: Date.now() - start, error: errMsg(e) };
  }
}

const INFRA: InfraDef[] = [
  { id: "site", name: "Site (VM)", ping: pingSite },
  { id: "database", name: "Neon Database", ping: pingDatabase },
  { id: "scraper", name: "Scraper API", ping: pingScraper },
  { id: "anilist", name: "AniList API", ping: pingAnilist },
];

function mapProviderStatus(status: string): ServiceStatus {
  switch (status) {
    case "healthy":
      return "operational";
    case "degraded":
      return "degraded";
    case "broken":
      return "outage";
    default:
      return "unknown";
  }
}

// A service is "up" (counts toward uptime) when operational or merely degraded.
function isUp(status: ServiceStatus): boolean {
  return status === "operational" || status === "degraded";
}

interface Observation {
  id: string;
  name: string;
  group: ServiceGroup;
  status: ServiceStatus;
  latencyMs: number | null;
  lastChecked: Date;
  error?: string;
  /**
   * True when this reading shouldn't be written to history or counted toward
   * overall status — a misconfigured service tells us nothing about uptime,
   * and recording it as "down" corrupts the uptime % permanently.
   */
  skipPersist?: boolean;
}

/**
 * Ping every service, persist a StatusCheck row each, open/resolve incidents,
 * and return the assembled status object for the API + page.
 */
export async function runStatusChecks(): Promise<StatusResult> {
  const now = new Date();
  console.log("[status] running status checks");

  // 1. Live infra pings (parallel) + provider statuses from the DB (parallel).
  const [infraSettled, providerStatuses] = await Promise.all([
    Promise.allSettled(INFRA.map((s) => s.ping())),
    db.providerStatus.findMany({ orderBy: { displayName: "asc" } }),
  ]);

  const observations: Observation[] = [];

  INFRA.forEach((def, i) => {
    const settled = infraSettled[i];
    const r: PingResult =
      settled.status === "fulfilled"
        ? settled.value
        : { success: false, latencyMs: 0, error: errMsg(settled.reason) };

    const status: ServiceStatus = classifyPing(r, DEGRADED_LATENCY_MS);

    if (r.configError) {
      console.error("[status] service is misconfigured", { service: def.id, error: r.error });
    }

    observations.push({
      id: def.id,
      name: def.name,
      group: "infrastructure",
      status,
      latencyMs: r.latencyMs,
      lastChecked: now,
      error: r.error,
      skipPersist: r.configError === true,
    });
  });

  for (const ps of providerStatuses) {
    observations.push({
      id: ps.providerId,
      name: ps.displayName,
      group: "providers",
      status: mapProviderStatus(ps.status),
      latencyMs: ps.latencyMs ?? null,
      lastChecked: ps.lastCheckedAt ?? now,
      error: ps.errorMessage ?? undefined,
    });
  }

  // 2. Persist one StatusCheck row per service for this run. A misconfigured
  //    service is skipped entirely: recording it as "down" would bake a config
  //    mistake into the uptime percentage forever.
  const persistable = observations.filter((o) => !o.skipPersist);
  if (persistable.length > 0) {
    await db.statusCheck.createMany({
      data: persistable.map((o) => ({
        service: o.id,
        success: isUp(o.status),
        latencyMs: Math.round(o.latencyMs ?? 0),
        checkedAt: now,
      })),
    });
  }

  // 3. Open / resolve incidents. An outage with no open incident opens one; an
  //    operational reading with an open incident auto-resolves it. (Degraded and
  //    unknown readings leave existing incident state untouched to avoid flapping.)
  const openIncidents = await db.statusIncident.findMany({
    where: { resolvedAt: null },
    orderBy: { startedAt: "desc" },
  });
  const openByService = new Map<string, (typeof openIncidents)[number]>();
  for (const inc of openIncidents) {
    if (!openByService.has(inc.service)) openByService.set(inc.service, inc);
  }

  let opened = 0;
  let resolved = 0;

  for (const o of observations) {
    if (o.skipPersist) continue; // config error != incident
    const open = openByService.get(o.id);
    if (o.status === "outage" && !open) {
      const created = await db.statusIncident.create({
        data: {
          service: o.id,
          description: o.error ? `${o.name}: ${o.error}` : `${o.name} stopped responding`,
          autoResolved: false,
        },
      });
      openByService.set(o.id, created);
      opened++;
    } else if (o.status === "operational" && open) {
      await db.statusIncident.update({
        where: { id: open.id },
        data: { resolvedAt: now, autoResolved: true },
      });
      openByService.delete(o.id);
      resolved++;
    }
  }

  // 4. Pull the last 90 checks per service for uptime % + sparkline (parallel).
  const histories = await Promise.all(
    observations.map((o) =>
      db.statusCheck.findMany({
        where: { service: o.id },
        orderBy: { checkedAt: "desc" },
        take: HISTORY_LIMIT,
      })
    )
  );

  const services: StatusService[] = observations.map((o, i) => {
    const rows = histories[i].slice().reverse(); // oldest → newest
    const total = rows.length;
    const successes = rows.filter((r) => r.success).length;
    const uptimePercent = total ? Math.round((successes / total) * 1000) / 10 : 100;

    const history: (boolean | null)[] = rows.map((r) => r.success);
    while (history.length < HISTORY_LIMIT) history.unshift(null);

    const open = openByService.get(o.id);

    return {
      id: o.id,
      name: o.name,
      group: o.group,
      status: o.status,
      latencyMs: o.latencyMs,
      uptimePercent,
      lastChecked: o.lastChecked.toISOString(),
      incident: open
        ? { startedAt: open.startedAt.toISOString(), description: open.description ?? "" }
        : undefined,
      history,
    };
  });

  // Infrastructure only — see computeOverallStatus() for why the legacy
  // provider group no longer votes.
  const overallStatus: OverallStatus = computeOverallStatus(services);

  return {
    services,
    overallStatus,
    lastUpdated: now.toISOString(),
    incidents: { opened, resolved },
  };
}

/**
 * READ-ONLY status snapshot — NO live pings, NO DB writes. Assembles the same
 * StatusResult shape from already-persisted data so public reads (GET /api/status,
 * the /status page) don't amplify load or pollute uptime history. The live checks
 * + persistence are the cron's job (runStatusChecks, every 5 min).
 *
 * Each infra service's current status/latency is derived from its most recent
 * StatusCheck row (a service with no rows yet reads "unknown"); provider services
 * come from ProviderStatus; uptime % + history use the last 90 StatusCheck rows
 * per service; currently-open StatusIncident rows are reflected as before.
 */
export async function getStatusSnapshot(): Promise<StatusResult> {
  const now = new Date();

  // Provider rows + open incidents up front (parallel).
  const [providerStatuses, openIncidents] = await Promise.all([
    db.providerStatus.findMany({ orderBy: { displayName: "asc" } }),
    db.statusIncident.findMany({
      where: { resolvedAt: null },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const openByService = new Map<string, (typeof openIncidents)[number]>();
  for (const inc of openIncidents) {
    if (!openByService.has(inc.service)) openByService.set(inc.service, inc);
  }

  // Last 90 checks per infra service (parallel) — drives both the current
  // reading (newest row) and the uptime % + sparkline.
  const infraHistories = await Promise.all(
    INFRA.map((def) =>
      db.statusCheck.findMany({
        where: { service: def.id },
        orderBy: { checkedAt: "desc" },
        take: HISTORY_LIMIT,
      })
    )
  );

  const observations: Observation[] = [];

  INFRA.forEach((def, i) => {
    const latest = infraHistories[i][0]; // newest, since ordered desc
    observations.push({
      id: def.id,
      name: def.name,
      group: "infrastructure",
      status: latest ? (latest.success ? "operational" : "outage") : "unknown",
      latencyMs: latest ? latest.latencyMs : null,
      lastChecked: latest ? latest.checkedAt : now,
    });
  });

  for (const ps of providerStatuses) {
    observations.push({
      id: ps.providerId,
      name: ps.displayName,
      group: "providers",
      status: mapProviderStatus(ps.status),
      latencyMs: ps.latencyMs ?? null,
      lastChecked: ps.lastCheckedAt ?? now,
      error: ps.errorMessage ?? undefined,
    });
  }

  // Provider services need their StatusCheck history too (infra already fetched).
  const providerHistories = await Promise.all(
    providerStatuses.map((ps) =>
      db.statusCheck.findMany({
        where: { service: ps.providerId },
        orderBy: { checkedAt: "desc" },
        take: HISTORY_LIMIT,
      })
    )
  );
  const histories = [...infraHistories, ...providerHistories];

  const services: StatusService[] = observations.map((o, i) => {
    const rows = histories[i].slice().reverse(); // oldest → newest
    const total = rows.length;
    const successes = rows.filter((r) => r.success).length;
    const uptimePercent = total ? Math.round((successes / total) * 1000) / 10 : 100;

    const history: (boolean | null)[] = rows.map((r) => r.success);
    while (history.length < HISTORY_LIMIT) history.unshift(null);

    const open = openByService.get(o.id);

    return {
      id: o.id,
      name: o.name,
      group: o.group,
      status: o.status,
      latencyMs: o.latencyMs,
      uptimePercent,
      lastChecked: o.lastChecked.toISOString(),
      incident: open
        ? { startedAt: open.startedAt.toISOString(), description: open.description ?? "" }
        : undefined,
      history,
    };
  });

  // Infrastructure only — see computeOverallStatus() for why the legacy
  // provider group no longer votes.
  const overallStatus: OverallStatus = computeOverallStatus(services);

  return {
    services,
    overallStatus,
    lastUpdated: now.toISOString(),
    incidents: { opened: 0, resolved: 0 },
  };
}
