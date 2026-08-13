import { test } from "node:test";
import assert from "node:assert/strict";
import { OWNED_SESSION_PREFIX, isOwnedSessionId, ownedSessionId } from "./owner-session.ts";

test("ownedSessionId namespaces the user id", () => {
  assert.equal(ownedSessionId("cku1abcd0000xyz"), "u:cku1abcd0000xyz");
  assert.ok(isOwnedSessionId(ownedSessionId("cku1abcd0000xyz")));
});

test("distinct users never share an owned session id", () => {
  assert.notEqual(ownedSessionId("userA"), ownedSessionId("userB"));
});

test("the same user always maps to the same owned session id", () => {
  // Stability matters: a non-deterministic value would create a fresh row on
  // every create instead of colliding harmlessly with the userId-keyed upsert.
  assert.equal(ownedSessionId("userA"), ownedSessionId("userA"));
});

test("owned ids cannot alias a browser session id", () => {
  // generateId() in auth.ts mints browser ids as `s` + base36 timestamp + two
  // base36 random chunks. Those characters can never produce a leading "u:".
  const browserish = ["s1a2b3c4d5e6f7g8", "sabc123", "s0", "session-id", ""];
  for (const id of browserish) {
    assert.equal(isOwnedSessionId(id), false, `${JSON.stringify(id)} must not read as owned`);
  }
  assert.ok(OWNED_SESSION_PREFIX.endsWith(":"), "prefix must contain a separator base36 can't emit");
});
