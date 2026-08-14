import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_EPISODE_NUMBER, parseProgressInput } from "./progress-input.ts";

const valid = { animeId: 5114, episodeId: "5114-1", progress: 120, duration: 1440 };

test("accepts what the player actually sends", () => {
  const r = parseProgressInput(valid);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.animeId, 5114);
    assert.equal(r.value.episodeId, "5114-1");
    assert.equal(r.value.episodeNum, 1);
    assert.equal(r.value.progress, 120);
    assert.equal(r.value.duration, 1440);
  }
});

test("REGRESSION GUARD: arbitrary episodeId strings are rejected", () => {
  // This is M7. Every distinct string minted a row on a text column with no
  // length cap, and /api/leaderboard ranks on _count.episodeId -- ~14,400
  // fabricated episodes/day within the rate limit, enough to take #1 and fire
  // real Discord DMs and public #badges posts.
  const farmed = ["x1", "x2", "farm-0001", "", " ", "5114-1 ", "a".repeat(500), "../../etc/passwd", "5114-1;drop"];
  for (const episodeId of farmed) {
    const r = parseProgressInput({ ...valid, episodeId });
    assert.equal(r.ok, false, `${JSON.stringify(episodeId)} must be rejected`);
  }
});

test("REGRESSION GUARD: episodeId must agree with animeId", () => {
  // Without the cross-check, episodeId is still an arbitrary namespace -- just
  // a numeric-looking one (`1-1`, `2-1`, `3-1`, ... is unbounded again).
  const r = parseProgressInput({ ...valid, animeId: 5114, episodeId: "9999-1" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /does not match/);
});

test("rejects non-integer, zero, negative and out-of-range animeId", () => {
  for (const animeId of [0, -1, 1.5, NaN, Infinity, null, undefined, "abc", {}, [], 2 ** 31]) {
    const r = parseProgressInput({ ...valid, animeId, episodeId: `${animeId}-1` });
    assert.equal(r.ok, false, `animeId ${String(animeId)} must be rejected`);
  }
});

test("accepts a numeric string animeId (the route used to coerce)", () => {
  const r = parseProgressInput({ ...valid, animeId: "5114" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.animeId, 5114);
});

test("episode numbers are bounded", () => {
  assert.equal(parseProgressInput({ animeId: 1, episodeId: "1-1" }).ok, true);
  assert.equal(parseProgressInput({ animeId: 1, episodeId: "1-1200" }).ok, true);
  assert.equal(parseProgressInput({ animeId: 1, episodeId: "1-0" }).ok, false, "episode 0 is not real");
  assert.equal(
    parseProgressInput({ animeId: 1, episodeId: `1-${MAX_EPISODE_NUMBER + 1}` }).ok,
    false,
    "beyond the cap",
  );
  assert.equal(parseProgressInput({ animeId: 1, episodeId: "1-999999" }).ok, false);
  assert.equal(parseProgressInput({ animeId: 1, episodeId: "1--1" }).ok, false, "negative");
});

test("rejects extra segments and non-canonical forms", () => {
  for (const episodeId of ["5114-1-2", "5114_1", "5114/1", "05114-1", "5114-01", "5114-", "-1", "5114"]) {
    assert.equal(
      parseProgressInput({ ...valid, episodeId }).ok,
      false,
      `${episodeId} must be rejected`,
    );
  }
});

test("progress and duration are non-negative bounded integers", () => {
  assert.equal(parseProgressInput({ ...valid, progress: -1 }).ok, false);
  assert.equal(parseProgressInput({ ...valid, duration: -1 }).ok, false);
  assert.equal(parseProgressInput({ ...valid, progress: NaN }).ok, false);
  assert.equal(parseProgressInput({ ...valid, duration: Infinity }).ok, false);
  assert.equal(parseProgressInput({ ...valid, duration: 999_999 }).ok, false, "longer than a day");
  assert.equal(parseProgressInput({ ...valid, progress: "120" }).ok, false, "strings not coerced");

  // absent -> 0, and fractional seconds floor rather than reject
  const r = parseProgressInput({ animeId: 5114, episodeId: "5114-1" });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual([r.value.progress, r.value.duration], [0, 0]);

  const f = parseProgressInput({ ...valid, progress: 12.7 });
  assert.equal(f.ok, true);
  if (f.ok) assert.equal(f.value.progress, 12);
});

test("rejects non-object bodies without throwing", () => {
  for (const body of [null, undefined, "", "string", 42, [], true]) {
    assert.equal(parseProgressInput(body).ok, false);
  }
});
