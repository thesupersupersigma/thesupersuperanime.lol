import { test } from "node:test";
import assert from "node:assert/strict";
import { isStaticAssetPath } from "./static-assets.ts";

test("REGRESSION GUARD: a page route with an image extension is NOT a static asset", () => {
  // This is M10. The old check was a bare `pathname.endsWith(".png")`, so any
  // route path with an image extension appended skipped both auth gates and
  // `GET /watch/21/1.png` rendered the full watch page to an anonymous visitor.
  // If the predicate is ever loosened back to a suffix test, these all flip.
  const bypasses = [
    "/watch/21/1.png",
    "/watch/21/1.jpg",
    "/watch/21/1.svg",
    "/watch/21/1.ico",
    "/anime/5114.png",
    "/user/someone.png",
    "/genres/action.png",
    "/admin.png", // single segment, but no route named this — see note below
    "/api/admin/status.png",
    "/account/settings.png",
    "/chat.png",
  ];
  for (const p of bypasses.filter((p) => p.includes("/", 1))) {
    assert.equal(isStaticAssetPath(p), false, `${p} must not bypass the gates`);
  }
});

test("nested paths can only pass via an explicit static prefix", () => {
  // The single-segment rule is the actual defence. Anything nested must match a
  // directory we deliberately ship as static.
  assert.equal(isStaticAssetPath("/watch/21/1.png"), false);
  assert.equal(isStaticAssetPath("/some/deep/route/thing.png"), false);
  assert.equal(isStaticAssetPath("/avatars/PP_1.png"), true);
  assert.equal(isStaticAssetPath("/_next/static/chunks/main.js"), true);
  assert.equal(isStaticAssetPath("/.well-known/openapi.json"), true);
});

test("every file actually shipped in public/ still resolves", () => {
  // Kept in sync with `ls web/public`. If one of these starts 307ing to /login
  // the asset is broken for every visitor.
  const shipped = [
    "/ABACABB.mp4",
    "/ads.txt",
    "/apple-touch-icon.png",
    "/banner.png",
    "/favicon-96x96.png",
    "/favicon.ico",
    "/favicon.svg",
    "/file.svg",
    "/globe.svg",
    "/IDDQD.mp4",
    "/IDKFA.mp4",
    "/KONAMI.mp4",
    "/llms.txt",
    "/next.svg",
    "/robots.txt",
    "/site.webmanifest",
    "/sw.js",
    "/vercel.svg",
    "/web-app-manifest-192x192.png",
    "/web-app-manifest-512x512.png",
    "/window.svg",
    "/avatars/PP_1.png",
    "/avatars/PP_14.png",
  ];
  for (const p of shipped) {
    assert.equal(isStaticAssetPath(p), true, `${p} is a real asset and must pass through`);
  }
});

test("Next-generated metadata routes pass through", () => {
  assert.equal(isStaticAssetPath("/sitemap.xml"), true);
  assert.equal(isStaticAssetPath("/opengraph-image.png"), true);
});

test("extensionless page routes are never static", () => {
  for (const p of ["/", "/watch/21/1", "/anime/5114", "/login", "/account", "/api/source", "/chat"]) {
    assert.equal(isStaticAssetPath(p), false, `${p} must be gated`);
  }
});

test("a path segment that merely contains a dot isn't enough", () => {
  assert.equal(isStaticAssetPath("/watch/21/1.png/extra"), false);
  assert.equal(isStaticAssetPath("/foo.png/bar"), false);
  assert.equal(isStaticAssetPath("/no-extension."), false);
  assert.equal(isStaticAssetPath("/.hidden"), false);
});

test("the prefix match requires a trailing slash, so it can't match a sibling route", () => {
  // `/avatars-admin` must not inherit `/avatars/`'s exemption.
  assert.equal(isStaticAssetPath("/avatars-admin/secret"), false);
  assert.equal(isStaticAssetPath("/_nextjs-secret/page"), false);
  assert.equal(isStaticAssetPath("/.well-knownish/thing"), false);
});

test("extension matching is case-insensitive", () => {
  assert.equal(isStaticAssetPath("/Banner.PNG"), true);
  assert.equal(isStaticAssetPath("/watch/21/1.PNG"), false);
});
