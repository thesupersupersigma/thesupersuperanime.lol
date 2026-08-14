import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, resetRateLimits, trackedKeyCount } from "./rate-limit.ts";

beforeEach(() => resetRateLimits());

const T0 = 1_700_000_000_000;

test("allows up to maxRequests then blocks", () => {
  for (let i = 0; i < 10; i++) {
    assert.equal(checkRateLimit("k", 10, 60_000, T0), true, `request ${i + 1} should pass`);
  }
  assert.equal(checkRateLimit("k", 10, 60_000, T0), false, "11th request should be blocked");
});

test("the window slides rather than resetting in steps", () => {
  for (let i = 0; i < 10; i++) checkRateLimit("k", 10, 60_000, T0 + i * 1000);
  // 9s in: all 10 hits still inside the 60s window.
  assert.equal(checkRateLimit("k", 10, 60_000, T0 + 9_000), false);
  // 60.5s after the FIRST hit: exactly one hit has aged out, so one slot frees.
  assert.equal(checkRateLimit("k", 10, 60_000, T0 + 60_500), true);
  assert.equal(checkRateLimit("k", 10, 60_000, T0 + 60_500), false);
});

test("keys are independent", () => {
  for (let i = 0; i < 10; i++) checkRateLimit("a", 10, 60_000, T0);
  assert.equal(checkRateLimit("a", 10, 60_000, T0), false);
  assert.equal(checkRateLimit("b", 10, 60_000, T0), true);
});

test("REGRESSION GUARD: expired keys are actually evicted", () => {
  // The pre-fix limiter tested `timestamps.length === 0` AFTER pushing, so the
  // delete was unreachable and the Map grew forever. If eviction regresses,
  // trackedKeyCount stays at 3 here.
  checkRateLimit("a", 10, 60_000, T0);
  checkRateLimit("b", 10, 60_000, T0);
  checkRateLimit("c", 10, 60_000, T0);
  assert.equal(trackedKeyCount(), 3);

  // A later call past the sweep interval triggers the sweep; the three stale
  // keys go, leaving only the key used now.
  checkRateLimit("d", 10, 60_000, T0 + 120_000);
  assert.equal(trackedKeyCount(), 1, "stale buckets must be dropped, not accumulated");
});

test("a key-spraying client does not grow the map without bound", () => {
  // 20k distinct keys inside one window — no sweep can fire (same timestamp),
  // so this exercises the MAX_KEYS ceiling path rather than the sweep.
  for (let i = 0; i < 20_000; i++) {
    assert.equal(checkRateLimit(`spray-${i}`, 10, 60_000, T0), true);
  }
  assert.ok(trackedKeyCount() <= 50_000, `expected a bounded map, got ${trackedKeyCount()}`);
});

test("an active key survives the sweep", () => {
  checkRateLimit("busy", 10, 60_000, T0);
  checkRateLimit("idle", 10, 60_000, T0);
  // Well past SWEEP_INTERVAL_MS, but "busy" was used just now.
  checkRateLimit("busy", 10, 60_000, T0 + 90_000);
  assert.equal(trackedKeyCount(), 1);
  // Its earlier hit has aged out of the 60s window, so it starts fresh-ish.
  for (let i = 0; i < 9; i++) checkRateLimit("busy", 10, 60_000, T0 + 90_000);
  assert.equal(checkRateLimit("busy", 10, 60_000, T0 + 90_000), false);
});

test("blocked keys keep sliding instead of being pinned", () => {
  for (let i = 0; i < 10; i++) checkRateLimit("k", 10, 60_000, T0);
  // Hammer it while blocked — rejected attempts must NOT count as hits, or the
  // window would never drain and the block would be permanent.
  for (let i = 0; i < 100; i++) {
    assert.equal(checkRateLimit("k", 10, 60_000, T0 + i * 10), false);
  }
  assert.equal(checkRateLimit("k", 10, 60_000, T0 + 61_000), true, "must recover after the window");
});

test("maxRequests of 1 works", () => {
  assert.equal(checkRateLimit("one", 1, 60_000, T0), true);
  assert.equal(checkRateLimit("one", 1, 60_000, T0), false);
});

// ── record: false (auth actions count only FAILED attempts) ─────────────────

test("record:false reports allowed/blocked without consuming budget", () => {
  for (let i = 0; i < 50; i++) {
    assert.equal(checkRateLimit("peek", 5, 60_000, T0, { record: false }), true);
  }
  // Nothing was consumed, so 5 real attempts still fit.
  for (let i = 0; i < 5; i++) assert.equal(checkRateLimit("peek", 5, 60_000, T0), true);
  assert.equal(checkRateLimit("peek", 5, 60_000, T0), false);
});

test("record:false still reports a key that is already over the limit", () => {
  for (let i = 0; i < 5; i++) checkRateLimit("hot", 5, 60_000, T0);
  assert.equal(checkRateLimit("hot", 5, 60_000, T0, { record: false }), false);
});

test("record:false does not create a bucket for an unseen key", () => {
  // Otherwise every successful login would leak a Map entry per IP.
  const before = trackedKeyCount();
  for (let i = 0; i < 100; i++) {
    checkRateLimit(`fresh-${i}`, 5, 60_000, T0, { record: false });
  }
  assert.equal(trackedKeyCount(), before, "peeking must not allocate");
});

test("REGRESSION GUARD: counting only failures means a correct password is never throttled", () => {
  // M12: the old limiter ran BEFORE the password check and counted every
  // attempt, so 5 requests locked a known email out for 15 minutes even with
  // the right password. Modelled here: N successful sign-ins (peek only) stay
  // allowed no matter how many.
  for (let i = 0; i < 100; i++) {
    assert.equal(checkRateLimit("signin:me@example.com:1.2.3.4", 5, 900_000, T0, { record: false }), true);
  }
});

test("REGRESSION GUARD: an attacker's failures don't lock a victim on another IP", () => {
  // The key includes the IP, so filling the attacker's bucket leaves the
  // victim's (email, their-own-IP) bucket untouched.
  const attacker = "signin:victim@example.com:203.0.113.9";
  const victim = "signin:victim@example.com:198.51.100.7";
  for (let i = 0; i < 10; i++) checkRateLimit(attacker, 5, 900_000, T0);
  assert.equal(checkRateLimit(attacker, 5, 900_000, T0, { record: false }), false, "attacker is throttled");
  assert.equal(checkRateLimit(victim, 5, 900_000, T0, { record: false }), true, "victim is unaffected");
});
