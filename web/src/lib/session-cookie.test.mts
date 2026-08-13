/**
 * The contract here is the whole of H1: the Edge proxy can only reject a forged
 * `user-session` cookie if these functions do. The headline case is the last
 * test — `document.cookie = "user-session=x"` must not verify.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { signSessionToken, splitSessionCookie, verifySessionCookie } from "./session-cookie.ts";

const SECRET = "test-secret-do-not-use-in-production";

before(() => {
  process.env.SESSION_COOKIE_SECRET = SECRET;
});

test("a freshly signed cookie verifies back to its token", async () => {
  const token = "a".repeat(64);
  const cookie = await signSessionToken(token);

  assert.ok(cookie.startsWith(`${token}.`), "cookie should be <token>.<sig>");
  assert.equal(await verifySessionCookie(cookie), token);
});

test("REGRESSION GUARD: an unsigned junk value never verifies", async () => {
  // This is literally the H1 bypass: the old gate accepted any truthy value.
  for (const forged of ["x", "1", "user", "a".repeat(64), "true", "null", "0"]) {
    assert.equal(await verifySessionCookie(forged), null, `${forged} must not verify`);
  }
});

test("a tampered token invalidates the signature", async () => {
  const token = "b".repeat(64);
  const cookie = await signSessionToken(token);
  const parts = splitSessionCookie(cookie)!;

  const swapped = `${"c".repeat(64)}.${parts.signature}`;
  assert.equal(await verifySessionCookie(swapped), null);

  // Flip one character of the token, keep the real signature.
  const nudged = `${token.slice(0, -1)}z.${parts.signature}`;
  assert.equal(await verifySessionCookie(nudged), null);
});

test("a tampered signature is rejected", async () => {
  const token = "d".repeat(64);
  const cookie = await signSessionToken(token);
  const parts = splitSessionCookie(cookie)!;

  const flipped = parts.signature.slice(0, -1) + (parts.signature.endsWith("0") ? "1" : "0");
  assert.equal(await verifySessionCookie(`${token}.${flipped}`), null);

  assert.equal(await verifySessionCookie(`${token}.`), null);
  assert.equal(await verifySessionCookie(`${token}.zzzz`), null, "non-hex signature");
  assert.equal(await verifySessionCookie(`${token}.abc`), null, "odd-length hex");
});

test("a signature from a different secret is rejected", async () => {
  const token = "e".repeat(64);
  const cookie = await signSessionToken(token);

  process.env.SESSION_COOKIE_SECRET = "a-completely-different-secret";
  try {
    assert.equal(await verifySessionCookie(cookie), null);
  } finally {
    process.env.SESSION_COOKIE_SECRET = SECRET;
  }
});

test("fails closed when no secret is configured", async () => {
  const token = "f".repeat(64);
  const cookie = await signSessionToken(token);

  const savedSession = process.env.SESSION_COOKIE_SECRET;
  const savedToken = process.env.TOKEN_SECRET;
  delete process.env.SESSION_COOKIE_SECRET;
  delete process.env.TOKEN_SECRET;
  try {
    // A gate that fails OPEN on misconfiguration is the bug being fixed.
    assert.equal(await verifySessionCookie(cookie), null);
    await assert.rejects(() => signSessionToken(token));
  } finally {
    process.env.SESSION_COOKIE_SECRET = savedSession;
    if (savedToken !== undefined) process.env.TOKEN_SECRET = savedToken;
  }
});

test("empty and malformed values are rejected without throwing", async () => {
  for (const value of ["", ".", "..", ".sig", "token.", undefined, null]) {
    assert.equal(await verifySessionCookie(value as string | undefined | null), null);
  }
});

test("TOKEN_SECRET is accepted as a fallback secret", async () => {
  const saved = process.env.SESSION_COOKIE_SECRET;
  delete process.env.SESSION_COOKIE_SECRET;
  process.env.TOKEN_SECRET = "fallback-secret";
  try {
    const token = "9".repeat(64);
    const cookie = await signSessionToken(token);
    assert.equal(await verifySessionCookie(cookie), token);
  } finally {
    process.env.SESSION_COOKIE_SECRET = saved;
    delete process.env.TOKEN_SECRET;
  }
});

test("splitSessionCookie splits on the LAST separator", () => {
  assert.deepEqual(splitSessionCookie("aa.bb.cc"), { token: "aa.bb", signature: "cc" });
  assert.equal(splitSessionCookie("nodot"), null);
  assert.equal(splitSessionCookie(".leading"), null);
  assert.equal(splitSessionCookie("trailing."), null);
});

test("signatures are deterministic for the same token and secret", async () => {
  // Sign-out looks the token up by value, so a nondeterministic signature would
  // still be fine — but a stable one keeps the cookie comparable in logs.
  const token = "7".repeat(64);
  assert.equal(await signSessionToken(token), await signSessionToken(token));
});
