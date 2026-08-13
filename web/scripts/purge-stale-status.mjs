#!/usr/bin/env node
/**
 * Clean up status history left behind by services that are no longer monitored.
 *
 * Context: `src/lib/status.ts` used to ping `ANIVEXA_API_URL || <hardcoded VM
 * IP>` under the service id "anivexa" — a variable no other code reads, for a
 * host that isn't in the video pipeline. It now pings SCRAPER_API_URL under the
 * id "scraper". That leaves behind:
 *
 *   - StatusCheck rows for "anivexa" recording the health of a service that was
 *     never the one serving video. They are not history for "scraper" and must
 *     NOT be renamed into it — that would import a false uptime record.
 *   - A permanently-open StatusIncident for "anivexa" that can never
 *     auto-resolve, because nothing reports on that id any more.
 *
 * DRY RUN BY DEFAULT. Nothing is written unless you pass --apply.
 *
 *   node scripts/purge-stale-status.mjs                  # show the plan
 *   node scripts/purge-stale-status.mjs --apply          # resolve incidents + delete checks
 *   node scripts/purge-stale-status.mjs --apply --include-legacy-providers
 *
 * Open incidents are RESOLVED (resolvedAt + autoResolved), not deleted, so the
 * audit trail survives. Only StatusCheck rows are deleted, and only for retired
 * service ids.
 *
 * `--include-legacy-providers` additionally resolves the gogoanime/aniwave
 * incidents. Those readings are accurate — those scrapers really are broken —
 * they're just irrelevant now that they no longer feed the video pipeline or
 * the overall status. Off by default because deleting accurate history is a
 * judgement call, not a cleanup.
 *
 * Run from web/:  node --env-file-if-exists=.env.local scripts/purge-stale-status.mjs
 */
import { PrismaClient } from "@prisma/client";

/** Service ids that no code reports on any more. */
const RETIRED_SERVICE_IDS = ["anivexa"];
/** Legacy core-dist providers — accurate but no longer relevant. */
const LEGACY_PROVIDER_IDS = ["gogoanime", "aniwave"];

const apply = process.argv.includes("--apply");
const includeLegacy = process.argv.includes("--include-legacy-providers");

const targets = includeLegacy ? [...RETIRED_SERVICE_IDS, ...LEGACY_PROVIDER_IDS] : RETIRED_SERVICE_IDS;

const db = new PrismaClient();

try {
  const checks = await db.statusCheck.groupBy({
    by: ["service"],
    where: { service: { in: targets } },
    _count: { _all: true },
  });

  const incidents = await db.statusIncident.findMany({
    where: { service: { in: targets }, resolvedAt: null },
    select: { id: true, service: true, startedAt: true, description: true },
  });

  console.log(apply ? "APPLYING" : "DRY RUN (pass --apply to write)");
  console.log("targets:", targets.join(", "));
  console.log("");

  console.log("StatusCheck rows to DELETE:");
  if (checks.length === 0) console.log("  (none)");
  for (const c of checks) console.log(`  ${c.service}: ${c._count._all}`);

  console.log("");
  console.log("Open StatusIncident rows to RESOLVE (kept, not deleted):");
  if (incidents.length === 0) console.log("  (none)");
  for (const i of incidents) {
    console.log(`  ${i.service}  since ${i.startedAt.toISOString()}  "${i.description ?? ""}"`);
  }

  if (!apply) {
    console.log("\nNothing written. Re-run with --apply to perform the above.");
  } else {
    const now = new Date();
    const resolved = await db.statusIncident.updateMany({
      where: { service: { in: targets }, resolvedAt: null },
      data: { resolvedAt: now, autoResolved: true },
    });
    const deleted = await db.statusCheck.deleteMany({ where: { service: { in: targets } } });
    console.log(`\nResolved ${resolved.count} incident(s); deleted ${deleted.count} StatusCheck row(s).`);
  }
} finally {
  await db.$disconnect();
}
