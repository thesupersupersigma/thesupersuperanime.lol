import { NextRequest, NextResponse } from "next/server";
import { createHmac, createCipheriv, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/core";

interface NormalizedStream {
  provider: string;
  url: string;
  quality: string;
  isM3U8: boolean;
  cookies: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { animeTitle, episodeNum, animeId } = body as {
      animeTitle?: string;
      episodeNum?: number;
      animeId?: number;
    };

    if (!animeTitle || episodeNum == null || animeId == null) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const sessionId = req.cookies.get("session-id")?.value ?? req.cookies.get("site-auth")?.value ?? "anonymous";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";

    if (!checkRateLimit(sessionId, 10, 60_000)) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }

    // 1. Fire off both scrapers simultaneously
    console.log(`[/api/source] Fetching streams for: ${animeTitle} | Ep: ${episodeNum}`);
    
    // THE FIX: We pass animeId to ReAnime as well, since its API supports anilist_id
    const [miruroResults, reanimeResults] = await Promise.allSettled([
      fetchMiruro(animeId, episodeNum),
      fetchReAnime(animeTitle, episodeNum, animeId)
    ]);

    const allStreams: NormalizedStream[] = [];

    if (miruroResults.status === "fulfilled" && miruroResults.value) {
      allStreams.push(...miruroResults.value);
    }
    if (reanimeResults.status === "fulfilled" && reanimeResults.value) {
      allStreams.push(...reanimeResults.value);
    }

    if (allStreams.length === 0) {
      return NextResponse.json({ error: "No playable streams found across any API" }, { status: 404 });
    }

    // 2. Group streams by provider (Server)
    const serverMap = new Map<string, NormalizedStream[]>();
    for (const stream of allStreams) {
      if (!serverMap.has(stream.provider)) {
        serverMap.set(stream.provider, []);
      }
      serverMap.get(stream.provider)!.push(stream);
    }

    // 3. Encrypt the URLs and build the final JSON
    const encryptionSecret = process.env.ENCRYPTION_SECRET;
    const tokenSecret = process.env.TOKEN_SECRET;

    if (!encryptionSecret || !tokenSecret) {
      throw new Error("ENCRYPTION_SECRET or TOKEN_SECRET is missing!");
    }

    const expiresAt = new Date(Date.now() + 30 * 60_000);
    const key = Buffer.from(encryptionSecret, "hex").subarray(0, 32);

    const finalServers = [];

    for (const [providerName, streams] of serverMap.entries()) {
      const tokenizedSources = await Promise.all(
        streams.map(async (source) => {
          const iv = randomBytes(16);
          const cipher = createCipheriv("aes-256-cbc", key, iv);
          const payload = JSON.stringify({ url: source.url, cookies: source.cookies });
          const encrypted = cipher.update(payload, "utf8", "hex") + cipher.final("hex");
          const encryptedUrl = iv.toString("hex") + ":" + encrypted;

          const tokenId = randomBytes(24).toString("hex");
          const signature = createHmac("sha256", tokenSecret).update(tokenId + expiresAt.toISOString()).digest("hex");
          
          const baseToken = `${tokenId}.${signature}`;
          const ext = source.isM3U8 ? ".m3u8" : ".mp4"; 

          await db.sourceToken.create({
            data: {
              token: baseToken,
              url: encryptedUrl,
              sessionId,
              ip,
              quality: source.quality,
              isM3U8: source.isM3U8,
              expiresAt,
            },
          });

          return {
            token: baseToken + ext,
            quality: source.quality,
            isM3U8: source.isM3U8,
          };
        })
      );

      finalServers.push({
        name: providerName,
        sources: tokenizedSources
      });
    }

    console.log(`[/api/source] Successfully compiled ${finalServers.length} working servers.`);
    return NextResponse.json({ servers: finalServers });
    
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Vercel Crash: ${msg}` }, { status: 500 });
  }
}

// ==========================================
// HELPER: Fetch from Miruro
// ==========================================
async function fetchMiruro(animeId: number, episodeNum: number): Promise<NormalizedStream[]> {
  const MIRURO_API_URL = process.env.MIRURO_API_URL || "https://miruro-api-qhis.onrender.com";
  const MIRURO_API_KEY = process.env.MIRURO_API_KEY || "fb6b36828b22617be219102d2a22e16a73c0784890b9536216ff4fd569ecc3b8";

  const epsRes = await fetch(`${MIRURO_API_URL}/episodes/${animeId}`, {
    headers: { "x-api-key": MIRURO_API_KEY },
    signal: AbortSignal.timeout(10000),
  });
  if (!epsRes.ok) return [];

  const epsData = await epsRes.json();
  const allProviders = ["zoro", "jet", "ally", "arc", "bee", "kiwi"];
  const validStreams: NormalizedStream[] = [];

  // THE FIX: Use Promise.all to ping all Miruro servers concurrently instead of stopping at the first one!
  await Promise.all(allProviders.map(async (provider) => {
    const subEps = epsData?.providers?.[provider]?.episodes?.sub;
    if (!Array.isArray(subEps)) return;

    const ep = subEps.find((e: { number: number; id: string }) => e.number === episodeNum);
    if (!ep || !ep.id) return;

    try {
      const streamRes = await fetch(`${MIRURO_API_URL}/${ep.id}`, {
        headers: { "x-api-key": MIRURO_API_KEY },
        signal: AbortSignal.timeout(8000),
      });
      if (!streamRes.ok) return;

      const streamData = await streamRes.json();
      if (!streamData.streams || streamData.streams.length === 0) return;

      const hlsStreams = streamData.streams.filter((s: any) => s.type === "hls" || s.url.includes(".m3u8"));
      if (hlsStreams.length === 0) return;

      let isAlive = false;
      try {
        await fetch(hlsStreams[0].url, {
          method: "GET",
          headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://kwik.cx/" },
          signal: AbortSignal.timeout(3000)
        });
        isAlive = true;
      } catch {}

      if (isAlive) {
        for (const s of hlsStreams) {
          validStreams.push({
            provider: `Miruro (${provider.toUpperCase()})`,
            url: s.url,
            quality: s.quality ? String(s.quality) : "auto",
            isM3U8: true,
            cookies: s.cookies || "",
          });
        }
      }
    } catch {}
  }));

  return validStreams;
}

// ==========================================
// HELPER: Fetch from ReAnime
// ==========================================
async function fetchReAnime(animeTitle: string, episodeNum: number, animeId: number): Promise<NormalizedStream[]> {
  const REANIME_API_URL = process.env.REANIME_API_URL;
  if (!REANIME_API_URL) return [];
  
  const validStreams: NormalizedStream[] = [];
  try {
    const searchRes = await fetch(`${REANIME_API_URL}/search?q=${encodeURIComponent(animeTitle)}&limit=3`, { 
      // FIX 1: Give search 8 seconds
      signal: AbortSignal.timeout(8000) 
    });
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();
    
    const slug = searchData.results?.[0]?.anime_id || searchData.data?.[0]?.anime_id;
    if (!slug) return [];

    const serversRes = await fetch(`${REANIME_API_URL}/servers/${slug}/${episodeNum}?anilist_id=${animeId}`, { 
      // FIX 2: Give server fetch 8 seconds
      signal: AbortSignal.timeout(8000) 
    });
    if (!serversRes.ok) return [];
    const serversData = await serversRes.json();
    
    const dataPayload = serversData.results || serversData.data || serversData;
    const serverList = dataPayload.sub || dataPayload.servers || dataPayload.list || (Array.isArray(dataPayload) ? dataPayload : []);

    if (!Array.isArray(serverList) || serverList.length === 0) return [];

    const streamPromises = serverList.map(async (srv: any) => {
      const dataLink = srv.dataLink || srv.link;
      const accessId = srv.access_id || srv.id || srv.data_id || srv.serverId;
      const serverName = srv.serverName || srv.server_name || srv.server || "ReAnime Server";

      let streamUrl = "";
      if (dataLink) {
        streamUrl = `${REANIME_API_URL}/stream/from-link?link=${encodeURIComponent(dataLink)}`;
      } else if (accessId) {
        streamUrl = `${REANIME_API_URL}/stream/${accessId}`;
      } else {
        return null;
      }

      try {
        console.log(`[/api/source] ReAnime asking for stream from: ${streamUrl}`);
        
        // FIX 3: THE MOST IMPORTANT ONE. Give the decryptor a full 12 seconds to bypass Cloudflare!
        const streamRes = await fetch(streamUrl, { signal: AbortSignal.timeout(12000) });
        
        if (!streamRes.ok) {
          console.log(`[/api/source] ❌ ReAnime Stream Fetch FAILED. Status: ${streamRes.status}`);
          return null;
        }
        
        const streamData = await streamRes.json();
        const sources = streamData.sources || streamData.streams || streamData.data?.sources || streamData.results?.sources || [];
        const hls = sources.find((s: any) => s.type === "hls" || s.file?.includes(".m3u8") || s.url?.includes(".m3u8"));
        
        if (hls) {
          return {
            provider: `ReAnime (${serverName.toUpperCase()})`,
            url: hls.url || hls.file,
            quality: hls.quality || "auto",
            isM3U8: true,
            cookies: ""
          };
        } else {
           console.log(`[/api/source] ❌ Could not find HLS in ReAnime response.`);
        }
      } catch (err: any) {
        console.log(`[/api/source] ❌ ReAnime Stream Crash:`, err.message);
        return null;
      }
      return null;
    });

    const resolvedStreams = await Promise.all(streamPromises);
    for (const s of resolvedStreams) {
      if (s) validStreams.push(s);
    }

  } catch (e) {
    console.error("[/api/source] ReAnime Fetch Error:", e);
  }
  return validStreams;
}