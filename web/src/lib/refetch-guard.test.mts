import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRefetch, type RefetchState } from "./refetch-guard.ts";

const OPTS = { windowMs: 60_000, maxAttempts: 3 };
const T0 = 1_700_000_000_000;

/** Drive N failures spaced `gapMs` apart and return each decision. */
function run(gapMs: number, count: number, opts = OPTS): boolean[] {
  let state: RefetchState = { lastAt: 0, attempts: 0 };
  const allowed: boolean[] = [];
  for (let i = 0; i < count; i++) {
    const d = evaluateRefetch(state, T0 + i * gapMs, opts);
    allowed.push(d.allow);
    state = d.next;
  }
  return allowed;
}

test("REGRESSION GUARD: an 8s hls.js retry cycle is stopped", () => {
  // The whole bug: hls.js exhausts its retries in ~6-10s, so every attempt
  // cleared the old 5s throttle and the loop ran until the rate limiter 429'd.
  // A time-only guard with a 5s window allows ALL of these.
  const allowed = run(8_000, 10);
  assert.deepEqual(allowed.slice(0, 3), [true, true, true], "first three attempts proceed");
  assert.ok(
    allowed.slice(3).every((a) => a === false),
    "everything after the cap must be refused",
  );
  assert.equal(allowed.filter(Boolean).length, 3);
});

test("the same is true at 6s and at 10s — it isn't tuned to one timing", () => {
  for (const gap of [6_000, 9_000, 10_000, 15_000]) {
    assert.equal(run(gap, 10).filter(Boolean).length, 3, `gap ${gap}ms`);
  }
});

test("a token expiring long into a session still gets its refetch", () => {
  // Two failures an hour apart are not a loop; each starts a fresh window.
  const allowed = run(60 * 60_000, 5);
  assert.ok(allowed.every(Boolean), "widely spaced retries must all be allowed");
});

test("the counter resets once the window lapses", () => {
  let state: RefetchState = { lastAt: 0, attempts: 0 };
  for (let i = 0; i < 3; i++) {
    state = evaluateRefetch(state, T0 + i * 1000, OPTS).next;
  }
  // 4th inside the window is refused...
  const blocked = evaluateRefetch(state, T0 + 4_000, OPTS);
  assert.equal(blocked.allow, false);
  // ...but past the window it's a new run.
  const fresh = evaluateRefetch(blocked.next, T0 + 4_000 + 60_001, OPTS);
  assert.equal(fresh.allow, true);
  assert.equal(fresh.next.attempts, 1);
});

test("the very first attempt is always allowed", () => {
  const d = evaluateRefetch({ lastAt: 0, attempts: 0 }, T0, OPTS);
  assert.equal(d.allow, true);
  assert.equal(d.next.attempts, 1);
});

test("a blocked attempt still advances the window, so hammering can't reset it", () => {
  // Otherwise a fast loop could keep lastAt stale and never converge.
  let state: RefetchState = { lastAt: 0, attempts: 0 };
  for (let i = 0; i < 3; i++) state = evaluateRefetch(state, T0 + i * 100, OPTS).next;
  const a = evaluateRefetch(state, T0 + 400, OPTS);
  const b = evaluateRefetch(a.next, T0 + 500, OPTS);
  assert.equal(a.allow, false);
  assert.equal(b.allow, false);
  assert.ok(b.next.attempts > a.next.attempts);
});
