import { db } from "@/lib/db";

// ── Shared status logic ───────────────────────────────────────────────────────
// Two code paths:
//   - runStatusChecks()   — live pings + persistence (StatusCheck/incident writes).
//                           Cron-only: GET /api/cron/status-check, every 5 min.
//   - getStatusSnapshot() — READ-ONLY assembly from persisted data, no pings/writes.
//                           Public reads: GET /api/status + the /status page, so
//                           hammering them can't amplify load or pollute history.

export type ServiceStatus = "operational" | "degraded" | "outage" | "unknown";
export type OverallStatus = "operational" | "degraded" | "outage";
export type ServiceGroup = "infrastructure" | "providers";

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

// Anivexa API — any response to its health endpoint counts as healthy.
async function pingAnivexa(): Promise<PingResult> {
  const start = Date.now();
  const base = (process.env.ANIVEXA_API_URL || "http://64.181.222.197:4000").replace(/\/$/, "");
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
  { id: "anivexa", name: "Anivexa API", ping: pingAnivexa },
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

    let status: ServiceStatus;
    if (!r.success) status = "outage";
    else if (r.latencyMs > DEGRADED_LATENCY_MS) status = "degraded";
    else status = "operational";

    observations.push({
      id: def.id,
      name: def.name,
      group: "infrastructure",
      status,
      latencyMs: r.latencyMs,
      lastChecked: now,
      error: r.error,
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

  // 2. Persist one StatusCheck row per service for this run.
  await db.statusCheck.createMany({
    data: observations.map((o) => ({
      service: o.id,
      success: isUp(o.status),
      latencyMs: Math.round(o.latencyMs ?? 0),
      checkedAt: now,
    })),
  });

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

  const hasOutage = services.some((s) => s.status === "outage");
  const hasDegraded = services.some((s) => s.status === "degraded");
  const overallStatus: OverallStatus = hasOutage
    ? "outage"
    : hasDegraded
      ? "degraded"
      : "operational";

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

  const hasOutage = services.some((s) => s.status === "outage");
  const hasDegraded = services.some((s) => s.status === "degraded");
  const overallStatus: OverallStatus = hasOutage
    ? "outage"
    : hasDegraded
      ? "degraded"
      : "operational";

  return {
    services,
    overallStatus,
    lastUpdated: now.toISOString(),
    incidents: { opened: 0, resolved: 0 },
  };
}
