/**
 * Integration test for H3 — the video proxy's playlist branch as a DB write
 * amplifier.
 *
 * The playlist branch writes one SourceToken row per URI in the upstream
 * playlist. Those ids used to be randomBytes(24), so a playlist fetched twice
 * produced two disjoint row sets that could never collide — and a playlist
 * token is `isM3U8`, so the single-use check never applies and one token stays
 * replayable for its full 3h life. Normal viewing wrote 250-1000 rows per
 * episode view; a scripted replay wrote that many again, per request.
 *
 * This exercises the real Prisma path (createMany + skipDuplicates against the
 * real unique index) inside an always-rolled-back transaction.
 *
 *   npm run test:db
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient, Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { deriveSegmentTokenId } from "../../src/lib/segment-token.ts";

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "DATABASE_URL not set — run with `npm run test:db`";

let db: PrismaClient;

class Rollback extends Error {}

async function inRolledBackTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let result!: T;
  try {
    await db.$transaction(
      async (tx) => {
        result = await fn(tx);
        throw new Rollback();
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
  return result;
}

const SECRET = "test-token-secret";
const SEGMENT_COUNT = 240; // a 24-minute episode at 6s segments

/** The rows one playlist rewrite would insert, as route.ts builds them. */
function buildRows(parentToken: string, expiresAt: Date, deriveId: (url: string) => string) {
  return Array.from({ length: SEGMENT_COUNT }, (_, i) => {
    const url = `https://cdn.example/hls/${parentToken.slice(0, 8)}/seg-${i}.ts`;
    return {
      token: deriveId(url),
      url: `deadbeef:${i.toString(16)}`, // stands in for the AES ciphertext
      sessionId: "u:test-user",
      ip: "203.0.113.9",
      quality: "chunk",
      isM3U8: false,
      expiresAt,
      used: false,
    };
  });
}

before(() => {
  if (!DATABASE_URL) return;
  db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
});

after(async () => {
  await db?.$disconnect();
});

test("replaying a playlist inserts zero new rows", { skip }, async () => {
  const outcome = await inRolledBackTx(async (tx) => {
    const parentToken = `${randomBytes(24).toString("hex")}.${randomBytes(32).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 3 * 60 * 60_000);
    const derive = (url: string) => deriveSegmentTokenId(parentToken, url, SECRET);

    const first = await tx.sourceToken.createMany({
      data: buildRows(parentToken, expiresAt, derive),
      skipDuplicates: true,
    });

    // Same token replayed: hls.js reloading the playlist, a quality switch, or
    // an attacker scripting GETs against a token they already hold.
    const second = await tx.sourceToken.createMany({
      data: buildRows(parentToken, expiresAt, derive),
      skipDuplicates: true,
    });
    const third = await tx.sourceToken.createMany({
      data: buildRows(parentToken, expiresAt, derive),
      skipDuplicates: true,
    });

    const total = await tx.sourceToken.count({
      where: { sessionId: "u:test-user", ip: "203.0.113.9" },
    });

    return { first: first.count, second: second.count, third: third.count, total };
  });

  assert.equal(outcome.first, SEGMENT_COUNT, "first rewrite writes the playlist");
  assert.equal(outcome.second, 0, "a replay must write nothing");
  assert.equal(outcome.third, 0, "and stay writing nothing");
  assert.equal(outcome.total, SEGMENT_COUNT, "three fetches, one playlist's worth of rows");
});

test("REGRESSION GUARD: random ids would have written the playlist three times", { skip }, async () => {
  // The pre-fix behaviour, proving the test above isn't passing vacuously.
  const outcome = await inRolledBackTx(async (tx) => {
    const parentToken = `${randomBytes(24).toString("hex")}.${randomBytes(32).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 3 * 60 * 60_000);
    const randomId = () => randomBytes(24).toString("hex");

    for (let i = 0; i < 3; i++) {
      await tx.sourceToken.createMany({
        data: buildRows(parentToken, expiresAt, randomId),
        skipDuplicates: true,
      });
    }

    return tx.sourceToken.count({ where: { sessionId: "u:test-user", ip: "203.0.113.9" } });
  });

  assert.equal(outcome, SEGMENT_COUNT * 3, "random ids never collide — this is the amplifier");
});

test("two viewers of the same episode keep separate rows", { skip }, async () => {
  // Segment rows carry the parent's sessionId/ip binding, so they must not be
  // shared between viewers even though the segment URLs are identical.
  const outcome = await inRolledBackTx(async (tx) => {
    const expiresAt = new Date(Date.now() + 3 * 60 * 60_000);
    const parentA = `${randomBytes(24).toString("hex")}.a`;
    const parentB = `${randomBytes(24).toString("hex")}.b`;

    const sharedUrl = "https://cdn.example/hls/shared/seg-0.ts";
    const rows = [parentA, parentB].map((parent) => ({
      token: deriveSegmentTokenId(parent, sharedUrl, SECRET),
      url: "deadbeef:0",
      sessionId: `u:viewer-${parent.slice(-1)}`,
      ip: "203.0.113.9",
      quality: "chunk",
      isM3U8: false,
      expiresAt,
      used: false,
    }));

    const res = await tx.sourceToken.createMany({ data: rows, skipDuplicates: true });
    return res.count;
  });

  assert.equal(outcome, 2, "identical segment URL under two parents must yield two rows");
});
