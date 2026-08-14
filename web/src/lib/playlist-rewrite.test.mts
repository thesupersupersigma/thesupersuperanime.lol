import { test } from "node:test";
import assert from "node:assert/strict";
import { countRewritableUris, parseUriTag, rewritePlaylist } from "./playlist-rewrite.ts";

const BASE = "https://realcdn.example/hls/";
const resolve = (uri: string) => new URL(uri, BASE).toString();
/** Records what was minted and returns a stand-in proxy path. */
function recorder() {
  const minted: { url: string; ext: string }[] = [];
  const mint = (url: string, ext: string) => {
    minted.push({ url, ext });
    return `/api/proxy/tok${minted.length}${ext}`;
  };
  return { minted, mint };
}

// ---------------------------------------------------------------------------
// The three tags that used to leak
// ---------------------------------------------------------------------------

test("REGRESSION GUARD: #EXT-X-MAP is rewritten (fMP4 init segment)", () => {
  const playlist = [
    "#EXTM3U",
    '#EXT-X-MAP:URI="init.mp4"',
    "#EXTINF:6.0,",
    "seg1.m4s",
  ].join("\n");

  const { minted, mint } = recorder();
  const out = rewritePlaylist(playlist, resolve, mint).join("\n");

  assert.ok(!out.includes("realcdn.example"), "the origin hostname must not survive anywhere");
  assert.ok(!out.includes('URI="init.mp4"'), "the init segment URI must be rewritten");
  assert.ok(out.includes('#EXT-X-MAP:URI="/api/proxy/'), out);
  assert.equal(minted[0].url, "https://realcdn.example/hls/init.mp4");
  assert.equal(minted[0].ext, ".m4s");
});

test("REGRESSION GUARD: #EXT-X-MEDIA renditions are rewritten as playlists", () => {
  // This is the sub/dub case: video renders, audio 404s.
  const playlist = [
    "#EXTM3U",
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Japanese",DEFAULT=YES,URI="audio/jpn.m3u8"',
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub",NAME="English",URI="subs/eng.m3u8"',
    "#EXT-X-STREAM-INF:BANDWIDTH=800000,AUDIO=\"aud\"",
    "video/720.m3u8",
  ].join("\n");

  const { minted, mint } = recorder();
  const out = rewritePlaylist(playlist, resolve, mint).join("\n");

  assert.ok(!out.includes("realcdn.example"));
  assert.equal(minted.length, 3, "two renditions + the STREAM-INF's following line");
  // Child playlists must be served as .m3u8 so fetching one re-enters the
  // rewrite branch instead of streaming through opaquely.
  assert.equal(minted[0].ext, ".m3u8");
  assert.equal(minted[1].ext, ".m3u8");
  // Other attributes on the line survive untouched.
  assert.ok(out.includes('TYPE=AUDIO,GROUP-ID="aud",NAME="Japanese",DEFAULT=YES'));
});

test("REGRESSION GUARD: #EXT-X-SESSION-KEY is rewritten, and not confused with #EXT-X-KEY", () => {
  const playlist = [
    "#EXTM3U",
    '#EXT-X-SESSION-KEY:METHOD=AES-128,URI="https://realcdn.example/k/session.key"',
    '#EXT-X-KEY:METHOD=AES-128,URI="https://realcdn.example/k/media.key",IV=0x0',
    "seg1.ts",
  ].join("\n");

  const { minted, mint } = recorder();
  const out = rewritePlaylist(playlist, resolve, mint).join("\n");

  assert.ok(!out.includes("realcdn.example"));
  assert.equal(minted[0].ext, ".key");
  assert.equal(minted[1].ext, ".key");
  // Exact-name matching: a startsWith check could class one as the other.
  assert.equal(parseUriTag('#EXT-X-SESSION-KEY:URI="a"')?.tag, "#EXT-X-SESSION-KEY");
  assert.equal(parseUriTag('#EXT-X-KEY:URI="a"')?.tag, "#EXT-X-KEY");
});

test("the previously-working paths still work", () => {
  const playlist = [
    "#EXTM3U",
    '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
    "#EXTINF:6.0,",
    "seg1.ts",
    "#EXTINF:6.0,",
    "https://realcdn.example/hls/seg2.ts",
  ].join("\n");

  const { minted, mint } = recorder();
  const out = rewritePlaylist(playlist, resolve, mint).join("\n");

  assert.equal(minted.length, 3);
  assert.equal(minted[0].ext, ".key");
  assert.equal(minted[1].ext, ".ts");
  assert.equal(minted[2].url, "https://realcdn.example/hls/seg2.ts");
  assert.ok(out.startsWith("#EXTM3U"));
  assert.ok(out.includes("#EXTINF:6.0,"), "non-URI tags pass through unchanged");
});

test("#EXT-X-STREAM-INF is left alone — its URI is the NEXT line", () => {
  const playlist = ["#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720", "720/index.m3u8"].join("\n");
  const { minted, mint } = recorder();
  const out = rewritePlaylist(playlist, resolve, mint);

  assert.equal(out[0], "#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720");
  assert.equal(minted.length, 1);
  assert.equal(minted[0].url, "https://realcdn.example/hls/720/index.m3u8");
});

test("tags without a URI attribute are untouched", () => {
  for (const line of [
    "#EXT-X-KEY:METHOD=NONE",
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Muxed",DEFAULT=YES',
    '#EXT-X-MAP:URI=""',
    "#EXT-X-ENDLIST",
    "#EXT-X-VERSION:7",
  ]) {
    assert.equal(parseUriTag(line), null, `${line} has nothing to rewrite`);
  }
  const { minted } = recorder();
  assert.equal(minted.length, 0);
});

test("unknown tags are passed through, never minted", () => {
  const playlist = '#EXT-X-CUSTOM-THING:URI="https://realcdn.example/x"';
  const { minted, mint } = recorder();
  const out = rewritePlaylist(playlist, resolve, mint);
  assert.equal(out[0], playlist, "an unrecognised tag is left verbatim");
  assert.equal(minted.length, 0);
});

test("blank lines and CRLF round-trip unchanged", () => {
  // Splitting on \n leaves a lone \r as the "blank" line; passthrough lines are
  // pushed verbatim, so the CRLF survives rather than being silently normalised.
  const playlist = "#EXTM3U\r\n\r\n#EXTINF:6.0,\r\nseg1.ts\r\n";
  const { minted, mint } = recorder();
  const out = rewritePlaylist(playlist, resolve, mint);
  assert.equal(out[0], "#EXTM3U\r");
  assert.equal(out[1], "\r", "blank CRLF line preserved verbatim");
  assert.equal(out[2], "#EXTINF:6.0,\r");
  assert.equal(minted.length, 1, "the segment line is still rewritten");

  // LF-only input keeps genuinely empty lines empty.
  const lf = rewritePlaylist("#EXTM3U\n\nseg1.ts", resolve, recorder().mint);
  assert.equal(lf[1], "");
});

test("an unresolvable URI is passed through rather than dropping the line", () => {
  const badResolve = () => {
    throw new Error("unreachable");
  };
  const { minted, mint } = recorder();
  // rewritePlaylist doesn't catch — the route's resolveUrl does — so model that.
  const safeResolve = (uri: string) => {
    try {
      return badResolve();
    } catch {
      return uri;
    }
  };
  const out = rewritePlaylist('#EXT-X-MAP:URI="init.mp4"', safeResolve, mint);
  assert.equal(minted[0].url, "init.mp4");
  assert.ok(out[0].includes("/api/proxy/"));
});

test("countRewritableUris counts tags and plain lines, not comments", () => {
  const playlist = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    '#EXT-X-MAP:URI="init.mp4"',
    '#EXT-X-KEY:METHOD=AES-128,URI="k.bin"',
    "#EXTINF:6.0,",
    "seg1.m4s",
    "#EXTINF:6.0,",
    "seg2.m4s",
    "#EXT-X-ENDLIST",
  ].join("\n");
  assert.equal(countRewritableUris(playlist), 4, "MAP + KEY + 2 segments");
});

test("a full fMP4 + multi-audio master leaks nothing", () => {
  const master = [
    "#EXTM3U",
    '#EXT-X-SESSION-KEY:METHOD=AES-128,URI="https://realcdn.example/k/s.key"',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="jpn",URI="https://realcdn.example/a/jpn.m3u8"',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="eng",URI="https://realcdn.example/a/eng.m3u8"',
    '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100000,URI="https://realcdn.example/i/iframe.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=800000,AUDIO="a"',
    "https://realcdn.example/v/720.m3u8",
  ].join("\n");

  const { minted, mint } = recorder();
  const out = rewritePlaylist(master, resolve, mint).join("\n");

  assert.ok(!out.includes("realcdn.example"), `origin leaked:\n${out}`);
  assert.equal(minted.length, 5);
});
