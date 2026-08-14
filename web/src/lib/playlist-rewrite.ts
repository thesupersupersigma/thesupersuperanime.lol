/**
 * HLS playlist rewriting — which lines carry a URI, and what to serve it as.
 *
 * The proxy exists so the browser never talks to the origin CDN directly: it
 * needs a spoofed Referer/Origin, and the real hostname is meant to stay
 * hidden. That only holds if EVERY URI in the playlist is rewritten.
 *
 * The old loop special-cased exactly one tag and then blanket-passed the rest:
 *
 *     if (trimmed.startsWith("#EXT-X-KEY:") && ...) { ...rewrite... }
 *     if (trimmed.startsWith("#")) { rewrittenLines.push(line); continue; }
 *
 * so these went out verbatim, pointing at the origin:
 *
 *   - #EXT-X-MAP          the fMP4 init segment. REQUIRED for any fMP4/CMAF
 *                         stream, and route.ts's own extension-strip list
 *                         already includes `m4s`, so fMP4 is expected. Without
 *                         it playback dies before the first frame: no ACAO
 *                         header and no spoofed Referer, so the browser's
 *                         request is CORS-blocked or hotlink-403'd.
 *   - #EXT-X-MEDIA        separate audio / subtitle renditions, i.e. exactly
 *                         the sub-vs-dub case this site is built around. Video
 *                         renders, audio 404s.
 *   - #EXT-X-SESSION-KEY  master-playlist key declaration.
 *
 * #EXT-X-STREAM-INF is deliberately NOT here: its URI is on the FOLLOWING
 * line, which the plain-line path already rewrites, so variant selection has
 * always worked.
 */

/**
 * Tags whose URI="…" attribute must be rewritten, and the extension to serve
 * the rewritten token as.
 *
 * `.m3u8` matters for the child-playlist tags: buildTokenData marks those
 * tokens `isM3U8`, so fetching one re-enters the rewrite branch and its own
 * contents get rewritten too. Serving them as `.ts` would stream a playlist
 * through as an opaque segment and leak every URI inside it.
 */
export const URI_TAG_EXTENSIONS: Readonly<Record<string, string>> = {
  "#EXT-X-KEY": ".key",
  "#EXT-X-SESSION-KEY": ".key",
  "#EXT-X-MAP": ".m4s",
  "#EXT-X-MEDIA": ".m3u8",
  "#EXT-X-I-FRAME-STREAM-INF": ".m3u8",
  "#EXT-X-PART": ".ts",
  "#EXT-X-PRELOAD-HINT": ".ts",
};

export interface UriTag {
  /** Tag name including the leading `#`, e.g. `#EXT-X-MAP`. */
  tag: string;
  /** Raw URI attribute value, exactly as it appeared. */
  uri: string;
  /** Extension the rewritten token should carry. */
  ext: string;
}

/**
 * If `trimmedLine` is a tag carrying a rewritable URI attribute, describe it.
 *
 * Matches on the exact tag name up to the first `:` — a `startsWith` check
 * would let `#EXT-X-SESSION-KEY` be mistaken for `#EXT-X-KEY` (or vice versa)
 * and serve a key under the wrong extension.
 */
export function parseUriTag(trimmedLine: string): UriTag | null {
  if (!trimmedLine.startsWith("#")) return null;
  const colon = trimmedLine.indexOf(":");
  if (colon === -1) return null;

  const tag = trimmedLine.slice(0, colon);
  const ext = URI_TAG_EXTENSIONS[tag];
  if (!ext) return null;

  const match = /URI="([^"]*)"/.exec(trimmedLine);
  // A tag may legitimately omit URI (e.g. #EXT-X-MEDIA for muxed audio, or
  // #EXT-X-KEY:METHOD=NONE); nothing to rewrite in that case.
  if (!match || match[1] === "") return null;

  return { tag, uri: match[1], ext };
}

/** True for a line that is a bare media/playlist URI rather than a tag. */
export function isPlainUriLine(trimmedLine: string): boolean {
  return trimmedLine.length > 0 && !trimmedLine.startsWith("#");
}

/** How many lines this playlist would mint a token for. Used to bound the work. */
export function countRewritableUris(playlist: string): number {
  let n = 0;
  for (const raw of playlist.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (isPlainUriLine(trimmed) || parseUriTag(trimmed)) n++;
  }
  return n;
}

/**
 * Mint a proxied token path for one absolute URL.
 * `ext` is the extension chosen above; the implementation may override it
 * (buildTokenData forces `.m3u8` when the target is itself a playlist).
 */
export type MintTokenFn = (absoluteUrl: string, ext: string) => string;

/**
 * Rewrite every URI in `playlist` through `mint`.
 *
 * `resolveUrl` turns a possibly-relative URI into an absolute one; a URI that
 * can't be resolved is passed through to `mint` as-is, matching the previous
 * behaviour rather than dropping the line.
 */
export function rewritePlaylist(
  playlist: string,
  resolveUrl: (uri: string) => string,
  mint: MintTokenFn,
): string[] {
  const out: string[] = [];

  for (const raw of playlist.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) {
      out.push(raw);
      continue;
    }

    const uriTag = parseUriTag(trimmed);
    if (uriTag) {
      const absolute = resolveUrl(uriTag.uri);
      const serveToken = mint(absolute, uriTag.ext);
      // Replace only the URI attribute, preserving every other attribute and
      // the line's original whitespace.
      out.push(raw.replace(`URI="${uriTag.uri}"`, `URI="${serveToken}"`));
      continue;
    }

    if (trimmed.startsWith("#")) {
      out.push(raw);
      continue;
    }

    out.push(mint(resolveUrl(trimmed), ".ts"));
  }

  return out;
}
