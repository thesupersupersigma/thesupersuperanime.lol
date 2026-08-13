import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPing, computeOverallStatus } from "./status-rules.ts";
import type { ServiceGroup, ServiceStatus } from "./status-types.ts";

const DEGRADED_MS = 2000;

test("a healthy fast ping is operational", () => {
  assert.equal(classifyPing({ success: true, latencyMs: 120 }, DEGRADED_MS), "operational");
});

test("a healthy slow ping is degraded", () => {
  assert.equal(classifyPing({ success: true, latencyMs: 2001 }, DEGRADED_MS), "degraded");
  assert.equal(classifyPing({ success: true, latencyMs: 2000 }, DEGRADED_MS), "operational");
});

test("a failed ping is an outage", () => {
  assert.equal(classifyPing({ success: false, latencyMs: 5000 }, DEGRADED_MS), "outage");
});

test("REGRESSION GUARD: a config error is 'unknown', never 'outage'", () => {
  // A missing SCRAPER_API_URL is a deployment mistake. Reporting it as an
  // outage is exactly what made the old "Anivexa API" row permanent noise that
  // everyone learned to ignore. "unknown" also means no incident is opened and
  // no StatusCheck row is written, so it can't corrupt the uptime percentage.
  const status = classifyPing({ success: false, latencyMs: 0, configError: true }, DEGRADED_MS);
  assert.equal(status, "unknown");
  assert.notEqual(status, "outage");
});

test("configError wins even if success is somehow true", () => {
  assert.equal(classifyPing({ success: true, latencyMs: 5, configError: true }, DEGRADED_MS), "unknown");
});

const svc = (group: ServiceGroup, status: ServiceStatus) => ({ group, status });

test("overall status is operational when all infrastructure is up", () => {
  assert.equal(
    computeOverallStatus([svc("infrastructure", "operational"), svc("infrastructure", "operational")]),
    "operational",
  );
});

test("infrastructure outage and degradation propagate", () => {
  assert.equal(
    computeOverallStatus([svc("infrastructure", "operational"), svc("infrastructure", "outage")]),
    "outage",
  );
  assert.equal(
    computeOverallStatus([svc("infrastructure", "operational"), svc("infrastructure", "degraded")]),
    "degraded",
  );
  // outage outranks degraded
  assert.equal(
    computeOverallStatus([svc("infrastructure", "degraded"), svc("infrastructure", "outage")]),
    "outage",
  );
});

test("REGRESSION GUARD: dead legacy providers no longer force a permanent outage", () => {
  // gogoanime/aniwave have been "broken" with 66 consecutive fails since their
  // domains died in 2024, and they used to vote — so /status read "Major
  // Outage" forever regardless of whether the site worked.
  const services = [
    svc("infrastructure", "operational"),
    svc("infrastructure", "operational"),
    svc("providers", "outage"),
    svc("providers", "outage"),
  ];
  assert.equal(computeOverallStatus(services), "operational");
});

test("a misconfigured infra service doesn't turn the banner red either", () => {
  assert.equal(
    computeOverallStatus([svc("infrastructure", "operational"), svc("infrastructure", "unknown")]),
    "operational",
  );
});

test("an empty service list is operational, not a crash", () => {
  assert.equal(computeOverallStatus([]), "operational");
});
