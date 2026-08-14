import { test } from "node:test";
import assert from "node:assert/strict";
import { checkProxyTarget, isBlockedIp, type LookupFn } from "./ssrf-guard.ts";

/** A resolver that always answers with the given addresses. */
function lookupOf(...addresses: string[]): LookupFn {
  return async () => addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
}
const lookupFails: LookupFn = async () => {
  throw new Error("ENOTFOUND");
};
const lookupEmpty: LookupFn = async () => [];
/** Stands in for a normal public name. */
const lookupPublic = lookupOf("93.184.216.34");

// ---------------------------------------------------------------------------
// The gap this fix closes: DNS was never resolved
// ---------------------------------------------------------------------------

test("REGRESSION GUARD: a public hostname resolving to a private address is blocked", async () => {
  // The old guard inspected only the literal hostname and fell through to
  // `return false // allowed`, so this was the whole bypass — no trickery
  // needed, just an A record.
  const v = await checkProxyTarget("http://rebind.attacker.tld/x.ts", {
    lookup: lookupOf("169.254.169.254"),
  });
  assert.equal(v.blocked, true);
  assert.match(v.reason ?? "", /169\.254\.169\.254/);
});

test("REGRESSION GUARD: host.docker.internal is blocked", async () => {
  // The proxy's own comment says it exists so "the browser never sees internal
  // hostnames like host.docker.internal" — which used to sail straight through.
  const v = await checkProxyTarget("http://host.docker.internal:4000/health", {
    lookup: lookupOf("192.168.65.2"),
  });
  assert.equal(v.blocked, true);
});

test("REGRESSION GUARD: 'localhost.' with a trailing dot is blocked", async () => {
  // Matched neither the old string compare nor either literal parser, yet
  // resolves to loopback.
  const v = await checkProxyTarget("http://localhost./", { lookup: lookupOf("127.0.0.1") });
  assert.equal(v.blocked, true);
});

test("a name resolving to BOTH public and private is blocked", async () => {
  // Must not slip through on the public record.
  for (const addrs of [
    ["93.184.216.34", "10.0.0.5"],
    ["10.0.0.5", "93.184.216.34"],
    ["93.184.216.34", "::1"],
  ]) {
    const v = await checkProxyTarget("http://mixed.example/x", { lookup: lookupOf(...addrs) });
    assert.equal(v.blocked, true, `${addrs.join(",")} must be blocked`);
  }
});

test("resolution failure and empty answers fail CLOSED", async () => {
  assert.equal((await checkProxyTarget("http://nope.example/", { lookup: lookupFails })).blocked, true);
  assert.equal((await checkProxyTarget("http://nope.example/", { lookup: lookupEmpty })).blocked, true);
});

test("an ordinary public hostname is still allowed", async () => {
  const v = await checkProxyTarget("https://cdn.example.com/hls/seg.ts", { lookup: lookupPublic });
  assert.equal(v.blocked, false);
  assert.deepEqual(v.addresses, ["93.184.216.34"]);
});

// ---------------------------------------------------------------------------
// The trap TASKS2 called out: ::ffff:0:0/96 must NOT be in the blocklist
// ---------------------------------------------------------------------------

test("REGRESSION GUARD: adding ::ffff:0:0/96 would block all IPv4 — it must not be present", async () => {
  // net.BlockList normalises IPv4 into IPv4-mapped form internally, so that
  // subnet matches EVERY IPv4 address. If someone "helpfully" adds it, these
  // public addresses start failing and all playback breaks.
  for (const ip of ["93.184.216.34", "1.1.1.1", "8.8.8.8", "151.101.1.140"]) {
    assert.equal(isBlockedIp(ip), false, `${ip} is public and must be allowed`);
  }
  const v = await checkProxyTarget("https://cdn.example.com/x", { lookup: lookupOf("1.1.1.1") });
  assert.equal(v.blocked, false);
});

test("IPv4-mapped IPv6 is still caught, in BOTH dotted and hex form", async () => {
  // 169.254.169.254 == a9fe:a9fe
  assert.equal(isBlockedIp("::ffff:169.254.169.254"), true);
  assert.equal(isBlockedIp("::ffff:a9fe:a9fe"), true);
  assert.equal(isBlockedIp("::ffff:127.0.0.1"), true);
  assert.equal(isBlockedIp("::ffff:7f00:1"), true);
  assert.equal(isBlockedIp("::ffff:10.0.0.1"), true);
  // and the mapped form of a PUBLIC address is not blocked
  assert.equal(isBlockedIp("::ffff:93.184.216.34"), false);
});

// ---------------------------------------------------------------------------
// Literal-IP handling (the part that was already sound — kept as a guard)
// ---------------------------------------------------------------------------

test("literal loopback in every encoding the URL parser normalises", async () => {
  for (const host of [
    "127.0.0.1",
    "2130706433", // integer
    "0x7f.1", // hex + short
    "127.1", // short
    "0177.0.0.1", // octal
    "127.0.0.1.", // trailing dot
  ]) {
    const v = await checkProxyTarget(`http://${host}/x`, { lookup: lookupPublic });
    assert.equal(v.blocked, true, `http://${host}/ must be blocked`);
  }
});

test("private, link-local, CGNAT and reserved literals are blocked", async () => {
  const blocked = [
    "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "192.0.0.1", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1",
    "224.0.0.1", "240.0.0.1", "255.255.255.255",
  ];
  for (const ip of blocked) {
    assert.equal(isBlockedIp(ip), true, `${ip} must be blocked`);
  }
});

test("IPv6 loopback, unique-local, link-local, NAT64 and doc ranges are blocked", async () => {
  for (const ip of ["::1", "::", "fc00::1", "fd00:ec2::254", "fe80::1", "64:ff9b::1", "2001:db8::1", "100::1"]) {
    assert.equal(isBlockedIp(ip), true, `${ip} must be blocked`);
  }
  // bracketed literal through the URL parser
  assert.equal((await checkProxyTarget("http://[::1]/x", { lookup: lookupPublic })).blocked, true);
  assert.equal((await checkProxyTarget("http://[fd00:ec2::254]/latest", { lookup: lookupPublic })).blocked, true);
});

test("a public IPv6 literal is allowed", async () => {
  assert.equal(isBlockedIp("2606:4700:4700::1111"), false);
  assert.equal((await checkProxyTarget("http://[2606:4700:4700::1111]/x", { lookup: lookupPublic })).blocked, false);
});

test("non-http schemes and malformed URLs are blocked", async () => {
  for (const url of [
    "file:///etc/passwd",
    "gopher://evil/x",
    "ftp://evil/x",
    "data:text/plain,hi",
    "javascript:alert(1)",
    "not a url",
    "",
  ]) {
    assert.equal((await checkProxyTarget(url, { lookup: lookupPublic })).blocked, true, `${url} must be blocked`);
  }
});

test("isBlockedIp treats non-IP input as blocked", () => {
  for (const junk of ["", "not-an-ip", "999.999.999.999", "::ffff:zzz"]) {
    assert.equal(isBlockedIp(junk), true);
  }
});

test("a literal IP host never consults DNS", async () => {
  let called = false;
  const spy: LookupFn = async () => {
    called = true;
    return [{ address: "93.184.216.34", family: 4 }];
  };
  await checkProxyTarget("https://93.184.216.34/x", { lookup: spy });
  assert.equal(called, false, "literal hosts must skip the resolver");
});
