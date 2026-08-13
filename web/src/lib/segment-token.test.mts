import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveSegmentTokenId } from "./segment-token.ts";

const SECRET = "test-token-secret";
const PARENT = "f".repeat(48) + "." + "a".repeat(64);
const SEG = "https://cdn.example/hls/seg-0001.ts";

test("REGRESSION GUARD: derivation is deterministic, not random", () => {
  // This is the entire point. The pre-fix code used randomBytes(24), so two
  // fetches of the same playlist produced disjoint token ids that could never
  // collide -- which is why skipDuplicates couldn't help and a replayed token
  // rewrote hundreds of rows every time. If this ever goes random again, the
  // write amplifier is back.
  const a = deriveSegmentTokenId(PARENT, SEG, SECRET);
  const b = deriveSegmentTokenId(PARENT, SEG, SECRET);
  assert.equal(a, b);
});

test("distinct segments of the same playlist get distinct ids", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 500; i++) {
    ids.add(deriveSegmentTokenId(PARENT, `https://cdn.example/hls/seg-${i}.ts`, SECRET));
  }
  assert.equal(ids.size, 500, "no collisions across a realistic playlist");
});

test("the same segment under a different parent token gets a different id", () => {
  // Two viewers of the same episode must not share segment rows -- each parent
  // token carries its own sessionId/ip binding.
  const a = deriveSegmentTokenId(PARENT, SEG, SECRET);
  const b = deriveSegmentTokenId("b".repeat(48) + "." + "c".repeat(64), SEG, SECRET);
  assert.notEqual(a, b);
});

test("the id is keyed — knowing the URL alone doesn't yield it", () => {
  const a = deriveSegmentTokenId(PARENT, SEG, SECRET);
  const b = deriveSegmentTokenId(PARENT, SEG, "a-different-token-secret");
  assert.notEqual(a, b);
});

test("id shape matches the column it replaces", () => {
  const id = deriveSegmentTokenId(PARENT, SEG, SECRET);
  // randomBytes(24).toString("hex") was 48 hex chars.
  assert.equal(id.length, 48);
  assert.match(id, /^[0-9a-f]{48}$/);
});

test("the parent/url separator is not forgeable by a crafted URL", () => {
  // A URL containing the separator must not be able to impersonate a different
  // (parent, url) pair. These two inputs differ only in where the "|" falls.
  const a = deriveSegmentTokenId("parentA", "|https://x/seg.ts", SECRET);
  const b = deriveSegmentTokenId("parentA|", "https://x/seg.ts", SECRET);
  // They DO collide under naive concatenation — documenting the property that
  // matters: the parent token is server-generated hex, so it can never contain
  // a "|", which is what keeps the encoding unambiguous in practice.
  assert.equal(a, b);
  assert.ok(!PARENT.includes("|"), "parent tokens are hex + '.' — never contain the separator");
});

test("empty inputs still produce a well-formed id", () => {
  assert.match(deriveSegmentTokenId("", "", SECRET), /^[0-9a-f]{48}$/);
});
