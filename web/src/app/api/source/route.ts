import { NextRequest, NextResponse } from "next/server";
import { createHmac, createCipheriv, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { getRacedSources, checkRateLimit } from "@/lib/core";
import type { VideoSource } from "@tsss/core";

/**
 * POST /api/source
 *
 * Body: { animeTitle: string, episodeNum: number, animeId: number }
 * Auth: site-auth cookie (handled by middleware)
 * Rate limit: 10 requests per minute per session
 *
 * Returns: { sources: [{ token, quality, isM3U8 }] }
 * Raw URLs NEVER appear in the response.
 */
export async function POST(req: NextRequest) {
  try {
    // ── Parse request ─────────────────────────────────────────────────────────
    const body = await req.json();
    const { animeTitle, episodeNum, animeId } = body as {
      animeTitle?: string;
      episodeNum?: number;
      animeId?: number;
    };

    if (!animeTitle || episodeNum == null || animeId == null) {
      return NextResponse.json(
        { error: "Missing required fields: animeTitle, episodeNum, animeId" },
        { status: 400 }
      );
    }

    // ── Get session + IP ──────────────────────────────────────────────────────
    const sessionId =
      req.cookies.get("session-id")?.value ??
      req.cookies.get("site-auth")?.value ??
      "anonymous";
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    // ── Rate limit ────────────────────────────────────────────────────────────
    if (!checkRateLimit(sessionId, 10, 60_000)) {
      return NextResponse.json(
        { error: "Rate limited — max 10 requests per minute" },
        { status: 429 }
      );
    }

    // ── Race all providers ────────────────────────────────────────────────────
    let episodeSources;
    try {
      const scrapeRes = await fetch(
        `${process.env.SCRAPER_SERVICE_URL}/scrape`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SERVICE_SECRET}`,
          },
          body: JSON.stringify({ animeTitle, episodeNum }),
          signal: AbortSignal.timeout(55_000),
        }
      )
      if (!scrapeRes.ok) {
        throw new Error(`Scraper service returned ${scrapeRes.status}`)
      }
      episodeSources = await scrapeRes.json()
    } catch (err) {
      console.error("[/api/source] Scraper service failed:", err instanceof Error ? err.message : "unknown");
      return NextResponse.json({ error: "No sources available — scraper service failed" }, { status: 503 });
    }

    // Log provider + latency only — NEVER log the actual URL
    console.log(
      `[/api/source] Provider: ${episodeSources.provider}, Latency: ${episodeSources.latencyMs}ms, Sources: ${episodeSources.sources.length}`
    );

    // ── Create signed tokens for each source ──────────────────────────────────
    const encryptionSecret = process.env.ENCRYPTION_SECRET;
    const tokenSecret = process.env.TOKEN_SECRET;

    if (!encryptionSecret || !tokenSecret) {
      console.error(
        "[/api/source] Missing ENCRYPTION_SECRET or TOKEN_SECRET env vars"
      );
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const expiresAt = new Date(Date.now() + 30 * 60_000); // 30 minutes

    const tokenizedSources = await Promise.all(
      episodeSources.sources.map(async (source: VideoSource) => {
        // Encrypt the raw URL with AES-256-CBC
        const iv = randomBytes(16);
        const key = Buffer.from(encryptionSecret, "hex").subarray(0, 32);
        const cipher = createCipheriv("aes-256-cbc", key, iv);
        const payload = JSON.stringify({ url: source.url, cookies: source.cookies ?? '' });
        let encrypted = cipher.update(payload, "utf8", "hex");
        encrypted += cipher.final("hex");
        const encryptedUrl = iv.toString("hex") + ":" + encrypted;

        // Generate a random token ID
        const tokenId = randomBytes(24).toString("hex");

        // Sign the token: HMAC-SHA256(tokenId + expiresAt, TOKEN_SECRET)
        const signature = createHmac("sha256", tokenSecret)
          .update(tokenId + expiresAt.toISOString())
          .digest("hex");

        const token = `${tokenId}.${signature}`;

        // Store in DB
        await db.sourceToken.create({
          data: {
            token,
            url: encryptedUrl,
            sessionId,
            ip,
            quality: source.quality,
            isM3U8: source.isM3U8,
            expiresAt,
          },
        });

        return {
          token,
          quality: source.quality,
          isM3U8: source.isM3U8,
        };
      })
    );

    return NextResponse.json({ sources: tokenizedSources });
  } catch (err) {
    console.error(
      "[/api/source] Unexpected error:",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
