import { test } from "node:test";
import assert from "node:assert/strict";
import { readCappedText } from "./read-capped.ts";

function streamOf(...chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(typeof c === "string" ? encoder.encode(c) : c);
      }
      controller.close();
    },
  });
}

test("reads a normal body in full", async () => {
  const vtt = "WEBVTT\n\n00:00.000 --> 00:02.000\nHello\n";
  assert.equal(await readCappedText(streamOf(vtt), 1024), vtt);
});

test("reassembles multi-chunk bodies correctly", async () => {
  assert.equal(await readCappedText(streamOf("WEB", "VTT", "\n\nline"), 1024), "WEBVTT\n\nline");
});

test("REGRESSION GUARD: returns null past the cap instead of buffering it all", async () => {
  // Pre-fix this path was `await res.text()` with no limit, so a large file on
  // an allowed CDN was buffered whole. If the cap regresses, this returns the
  // payload instead of null.
  const big = "x".repeat(5000);
  assert.equal(await readCappedText(streamOf(big), 1024), null);
});

test("the cap counts across chunks, not per chunk", async () => {
  const chunks = Array.from({ length: 10 }, () => "y".repeat(200)); // 2000 bytes
  assert.equal(await readCappedText(streamOf(...chunks), 1024), null);
});

test("a body exactly at the limit is accepted", async () => {
  const exact = "z".repeat(1024);
  assert.equal(await readCappedText(streamOf(exact), 1024), exact);
  assert.equal(await readCappedText(streamOf("z".repeat(1025)), 1024), null);
});

test("counts BYTES, not characters — multi-byte text can't smuggle past the cap", async () => {
  // 400 x 3-byte chars = 1200 bytes but only 400 JS characters. A length-based
  // check would wave this through.
  const multibyte = "あ".repeat(400);
  assert.equal(new TextEncoder().encode(multibyte).byteLength, 1200);
  assert.equal(await readCappedText(streamOf(multibyte), 1024), null);
});

test("onExceeded fires once with the byte count", async () => {
  const seen: number[] = [];
  await readCappedText(streamOf("x".repeat(3000)), 1024, (n) => seen.push(n));
  assert.equal(seen.length, 1);
  assert.ok(seen[0] > 1024);
});

test("a null body reads as empty rather than throwing", async () => {
  assert.equal(await readCappedText(null, 1024), "");
});

test("an empty body reads as empty string", async () => {
  assert.equal(await readCappedText(streamOf(), 1024), "");
});

test("cancels the upstream body when the cap is hit", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("x".repeat(5000)));
      // deliberately left open — a real oversized download keeps streaming
    },
    cancel() {
      cancelled = true;
    },
  });
  assert.equal(await readCappedText(stream, 1024), null);
  assert.equal(cancelled, true, "the socket must not be left draining a large file");
});
