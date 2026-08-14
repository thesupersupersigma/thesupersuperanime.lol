/**
 * Which request paths are genuine static assets, and may therefore skip every
 * auth gate in src/proxy.ts.
 *
 * This used to be a suffix test against the raw route path:
 *
 *     pathname.endsWith(".svg") || pathname.endsWith(".png") ||
 *     pathname.endsWith(".jpg") || pathname.endsWith(".ico")
 *
 * Route paths are attacker-chosen, so appending an image extension to ANY page
 * route walked around both gates: `GET /watch/21/1.png` rendered the full watch
 * page — nav, sidebar, player shell, JSON-LD — to a completely unauthenticated
 * visitor, with no cookie of any kind. Unlike the forged-cookie bypass (H1),
 * this one didn't go *through* the gate, it went *around* it.
 *
 * The rule is now "does this look like a file we actually ship", not "does this
 * string end in .png":
 *
 *   - a known static directory prefix (`/_next/`, `/avatars/`, `/.well-known/`)
 *   - or a SINGLE-segment path with a static file extension (`/banner.png`,
 *     `/sw.js`, `/site.webmanifest`) — every non-nested file in `public/`, plus
 *     Next's generated metadata routes
 *
 * A nested path can only pass via an explicit prefix, so no page route can
 * qualify: Next page routes never carry a file extension, and any route deep
 * enough to look like one (`/watch/21/1.png`) fails the single-segment test.
 */

/** Directories whose entire contents are static files we serve as-is. */
const STATIC_DIR_PREFIXES = [
  "/_next/",
  "/.well-known/",
  "/avatars/", // preset profile pictures: public/avatars/PP_1..14.png
];

/**
 * A single path segment ending in a static file extension.
 *
 * The character class excludes `/`, which is what enforces "top level only" —
 * that is the whole defence, so don't relax it to allow nested paths without
 * adding an explicit prefix above instead.
 */
const STATIC_FILE = new RegExp(
  "^/[A-Za-z0-9._-]+\\." +
    "(?:svg|png|jpe?g|gif|webp|avif|ico|bmp" + // images
    "|mp4|webm|ogg|mp3|wav" + // media
    "|txt|xml|json|webmanifest|map" + // metadata
    "|js|mjs|css" + // scripts/styles served from public/ (e.g. /sw.js)
    "|woff2?|ttf|otf|eot)$", // fonts
  "i",
);

/**
 * True when `pathname` is a static asset that may bypass the auth gates.
 * `pathname` must be the already-normalised URL path (`req.nextUrl.pathname`),
 * not a raw, still-encoded request target.
 */
export function isStaticAssetPath(pathname: string): boolean {
  if (STATIC_DIR_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return STATIC_FILE.test(pathname);
}
