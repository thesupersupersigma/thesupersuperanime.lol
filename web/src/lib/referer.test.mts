/**
 * Tests for the proxy's Referer/Origin spoofing (src/lib/referer.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseReferer, toOrigin } from "./referer.ts";

const u = (s: string) => new URL(s);

test("REGRESSION GUARD: the scraper's referer is never overwritten by a substring match", () => {
  // The old code overwrote the stored referer whenever the decrypted URL merely
  // CONTAINED "kwik" / "owocdn" / "uwu.m3u8" anywhere — path and query
  // included — so a hardcoded heuristic outranked the scraper's authoritative
  // value for any URL that happened to include those strings.
  const stored = "https://megaplay.buzz/stream/s-2/141234/sub";
  const hijackers = [
    "https://cdn.example.com/kwik/seg1.ts",
    "https://cdn.example.com/v/seg.ts?src=owocdn",
    "https://cdn.example.com/uwu.m3u8",
    "https://cdn.example.top/seg1.ts",
    "https://kwik.cx/seg1.ts",
  ];
  for (const url of hijackers) {
    assert.equal(
      normaliseReferer(stored, u(url)),
      "https://megaplay.buzz/stream/s-2/141234/sub/",
      `${url} must not override the stored referer`,
    );
  }
});

test("REGRESSION GUARD: a bare .top TLD no longer triggers the override", () => {
  // ".top" is a general-purpose TLD; matching on it caught unrelated hosts.
  assert.equal(normaliseReferer("", u("https://someone-elses-cdn.top/seg.ts")), "https://megaplay.buzz/");
});

test("the kwik override still applies when the scraper supplied nothing", () => {
  for (const host of ["kwik.cx", "www.kwik.cx", "files.owocdn.com", "kwik.si"]) {
    assert.equal(normaliseReferer("", u(`https://${host}/seg.ts`)), "https://kwik.cx/", host);
  }
});

test("host matching is on the registrable domain, not a substring", () => {
  // evil-kwik.cx.attacker.com and kwik.cx.evil.com must NOT match.
  for (const host of ["kwik.cx.evil.com", "notkwik.cx", "evilkwik.cx", "owocdn.com.evil.net"]) {
    assert.equal(
      normaliseReferer("", u(`https://${host}/seg.ts`)),
      "https://megaplay.buzz/",
      `${host} must not be treated as a kwik host`,
    );
  }
});

test("a stored referer gains exactly one trailing slash", () => {
  assert.equal(normaliseReferer("https://a.example", u("https://x/y")), "https://a.example/");
  assert.equal(normaliseReferer("https://a.example/", u("https://x/y")), "https://a.example/");
});

test("REGRESSION GUARD: Origin is a real origin, never a path", () => {
  // `referer.replace(/\/$/, "")` stripped only the trailing slash and kept the
  // path, producing an invalid Origin that a parsing WAF rejects.
  assert.equal(toOrigin("https://megaplay.buzz/stream/s-2/141234/sub/"), "https://megaplay.buzz");
  assert.equal(toOrigin("https://megaplay.buzz/"), "https://megaplay.buzz");
  assert.equal(toOrigin("https://kwik.cx/"), "https://kwik.cx");

  for (const r of ["https://a.example/deep/path/", "http://b.example:8080/x/"]) {
    const origin = toOrigin(r);
    assert.doesNotThrow(() => new URL(origin), `${origin} must parse`);
    assert.equal(new URL(origin).pathname, "/", "an origin carries no path");
  }
  assert.equal(toOrigin("http://b.example:8080/x/"), "http://b.example:8080", "port preserved");
});

test("toOrigin degrades rather than throwing on junk", () => {
  assert.equal(toOrigin("not a url/"), "not a url");
  assert.equal(toOrigin(""), "");
});
