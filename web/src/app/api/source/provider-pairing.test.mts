/**
 * Unit tests for the two /api/source provider-pairing bugs.
 *
 * Both produced the same symptom — "ReAnime randomly disappears between page
 * loads" — from independent causes, so each has a test that fails loudly if the
 * corresponding fix is reverted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProviderQueue,
  buildWatchCalls,
  pendingProviders,
  providerKey,
  verifyEpisodeResponse,
  type EpisodeRef,
  type EpisodesResponse,
} from "./provider-pairing.ts";

const ANINEKO_EPISODES: EpisodeRef[] = [
  { id: "solo-leveling-1234/ep-1", number: 1 },
  { id: "solo-leveling-1234/ep-2", number: 2 },
];
const REANIME_EPISODES: EpisodeRef[] = [
  { id: "151807/1", number: 1 },
  { id: "151807/2", number: 2 },
];

// ---------------------------------------------------------------------------
// 2a — response keyed under the requested provider, not the answering one
// ---------------------------------------------------------------------------

test("2a: an aggregator fallback body is rejected, not filed under the requested provider", () => {
  // We asked ReAnime; the aggregator answered with AniNeko's list.
  const verdict = verifyEpisodeResponse("reanime", {
    provider: "anineko",
    episodes: ANINEKO_EPISODES,
  });

  assert.equal(verdict.accepted, false);
  assert.equal(verdict.accepted === false && verdict.reason, "mismatch");
  assert.equal(verdict.answered, "anineko");
});

test("2a: AniNeko-shaped ids can never reach a ReAnime /watch call", () => {
  // The end-to-end version of the bug: build the map the way the route does and
  // assert nothing pairs ReAnime with a slug-shaped episode id.
  const queue = ["reanime", "anineko"];
  const episodesByProvider = new Map<string, EpisodeRef[]>();

  for (const requested of queue) {
    // The scraper answers BOTH requests with the AniNeko body.
    const verdict = verifyEpisodeResponse(requested, {
      provider: "anineko",
      episodes: ANINEKO_EPISODES,
    });
    if (verdict.accepted) episodesByProvider.set(verdict.answered, verdict.episodes);
  }

  const calls = buildWatchCalls(queue, episodesByProvider, 1);

  assert.deepEqual(calls, [{ provider: "anineko", episodeId: "solo-leveling-1234/ep-1" }]);
  const reanimeCall = calls.find((c) => providerKey(c.provider) === "reanime");
  assert.equal(reanimeCall, undefined, "ReAnime must not be paired with a foreign episode id");
});

test("2a: a matching response is accepted (case- and whitespace-insensitive)", () => {
  const verdict = verifyEpisodeResponse("ReAnime", {
    provider: " reanime ",
    episodes: REANIME_EPISODES,
  });
  assert.equal(verdict.accepted, true);
  assert.equal(verdict.accepted === true && verdict.answered, "reanime");
});

test("2a: a response that names no provider is trusted (older API builds)", () => {
  const withoutProvider: EpisodesResponse = { episodes: REANIME_EPISODES };
  const verdict = verifyEpisodeResponse("reanime", withoutProvider);
  assert.equal(verdict.accepted, true);
  assert.equal(verdict.accepted === true && verdict.answered, "reanime");

  const explicitNull = verifyEpisodeResponse("reanime", { provider: null, episodes: REANIME_EPISODES });
  assert.equal(explicitNull.accepted, true);
});

test("2a: empty and malformed bodies are rejected without throwing", () => {
  for (const body of [null, undefined, {}, { episodes: [] }, { episodes: null }] as const) {
    const verdict = verifyEpisodeResponse("reanime", body as EpisodesResponse | null);
    assert.equal(verdict.accepted, false);
    assert.equal(verdict.accepted === false && verdict.reason, "empty");
  }
});

// ---------------------------------------------------------------------------
// 2b — slice(1) dropped the top provider when the primary call failed
// ---------------------------------------------------------------------------

test("2b: a failed primary /episodes call still leaves the top provider queryable", () => {
  // Primary call rejected/timed out -> primaryEps is null.
  const queue = buildProviderQueue(null, {
    mappings: [
      { provider: "reanime", id: "151807", title: "Solo Leveling", score: 0.98 },
      { provider: "anineko", id: "solo-leveling-1234", title: "Solo Leveling", score: 0.81 },
    ],
  });

  assert.deepEqual(queue, ["reanime", "anineko"], "highest-scored mapping leads the queue");

  const episodesByProvider = new Map<string, EpisodeRef[]>();
  const pending = pendingProviders(queue, episodesByProvider);

  // The old `queue.slice(1)` returned ["anineko"] here, so ReAnime — the
  // top-ranked, perfectly healthy provider — was never fetched and vanished.
  assert.deepEqual(pending, ["reanime", "anineko"]);
  assert.ok(pending.includes("reanime"), "top provider must be fetched when the primary call failed");
});

test("2b: with a single mapping, a failed primary no longer means a hard 404", () => {
  const queue = buildProviderQueue(null, {
    mappings: [{ provider: "reanime", id: "151807", title: "Solo Leveling", score: 0.98 }],
  });
  const episodesByProvider = new Map<string, EpisodeRef[]>();

  const pending = pendingProviders(queue, episodesByProvider);
  assert.deepEqual(pending, ["reanime"]); // slice(1) gave [] -> zero watch calls -> 404

  // Simulate that fetch succeeding, then confirm a watch call is produced.
  const verdict = verifyEpisodeResponse("reanime", { provider: "reanime", episodes: REANIME_EPISODES });
  assert.equal(verdict.accepted, true);
  if (verdict.accepted) episodesByProvider.set(verdict.answered, verdict.episodes);

  assert.deepEqual(buildWatchCalls(queue, episodesByProvider, 2), [
    { provider: "reanime", episodeId: "151807/2" },
  ]);
});

test("2b: a primary that answered is not re-fetched", () => {
  const primary: EpisodesResponse = { provider: "anikoto", episodes: REANIME_EPISODES };
  const queue = buildProviderQueue(primary, {
    mappings: [
      { provider: "anikoto", id: "a", title: "t", score: 0.9 },
      { provider: "anineko", id: "b", title: "t", score: 0.5 },
    ],
  });
  assert.deepEqual(queue, ["anikoto", "anineko"], "primary leads and is not duplicated");

  const episodesByProvider = new Map<string, EpisodeRef[]>([["anikoto", REANIME_EPISODES]]);
  assert.deepEqual(pendingProviders(queue, episodesByProvider), ["anineko"]);
});

test("2b: a primary with a null provider does not occupy a queue slot it can't fill", () => {
  // `provider: null` means the API didn't say who answered, so those ids are
  // unattributable. The queue must come entirely from /info, and every entry
  // must still be fetchable.
  const queue = buildProviderQueue({ provider: null, episodes: ANINEKO_EPISODES }, {
    mappings: [{ provider: "reanime", id: "151807", title: "t", score: 0.9 }],
  });

  assert.deepEqual(queue, ["reanime"]);
  assert.deepEqual(pendingProviders(queue, new Map()), ["reanime"]);
});

// ---------------------------------------------------------------------------
// queue construction
// ---------------------------------------------------------------------------

test("buildProviderQueue dedupes case-insensitively and preserves /info order", () => {
  const queue = buildProviderQueue(
    { provider: "AniNeko", episodes: ANINEKO_EPISODES },
    {
      mappings: [
        { provider: "anineko", id: "a", title: "t", score: 0.9 },
        { provider: "ReAnime", id: "b", title: "t", score: 0.8 },
        { provider: "anikoto", id: "c", title: "t", score: 0.7 },
      ],
    },
  );
  assert.deepEqual(queue, ["AniNeko", "ReAnime", "anikoto"]);
});

test("buildProviderQueue tolerates missing/garbage inputs", () => {
  assert.deepEqual(buildProviderQueue(null, null), []);
  assert.deepEqual(buildProviderQueue({}, {}), []);
  assert.deepEqual(buildProviderQueue(null, { mappings: null }), []);
  // Blank provider names must not create an empty-string queue slot.
  assert.deepEqual(
    buildProviderQueue({ provider: "   " }, { mappings: [{ provider: "", id: "", title: "", score: 0 }] }),
    [],
  );
});

test("buildWatchCalls skips providers lacking the requested episode", () => {
  const map = new Map<string, EpisodeRef[]>([
    ["reanime", REANIME_EPISODES],
    ["anineko", [{ id: "slug/ep-1", number: 1 }]],
  ]);
  assert.deepEqual(buildWatchCalls(["reanime", "anineko"], map, 2), [
    { provider: "reanime", episodeId: "151807/2" },
  ]);
  assert.deepEqual(buildWatchCalls(["reanime", "anineko"], map, 99), []);
});
