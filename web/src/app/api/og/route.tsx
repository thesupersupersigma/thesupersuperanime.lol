import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

interface AnilistOgMedia {
  title: { english: string | null; romaji: string | null };
  coverImage: { extraLarge: string | null; large: string | null };
  bannerImage: string | null;
  averageScore: number | null;
  episodes: number | null;
  format: string | null;
}

const QUERY = `
  query($id: Int) {
    Media(id: $id, type: ANIME) {
      title { english romaji }
      coverImage { extraLarge large }
      bannerImage
      averageScore
      episodes
      format
    }
  }
`;

async function fetchAnime(animeId: string): Promise<AnilistOgMedia | null> {
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { id: Number(animeId) } }),
    });

    if (!res.ok) return null;

    const json = await res.json();
    return json?.data?.Media ?? null;
  } catch {
    return null;
  }
}

function getTitleDisplay(title: string): { text: string; fontSize: number } {
  if (title.length <= 25) return { text: title, fontSize: 52 };
  if (title.length <= 40) return { text: title, fontSize: 40 };
  if (title.length <= 60) return { text: title, fontSize: 30 };
  return { text: `${title.slice(0, 60).trimEnd()}…`, fontSize: 26 };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const animeId = searchParams.get("animeId");
  const ep = searchParams.get("ep");

  if (!animeId) {
    return new Response("Missing animeId", { status: 400 });
  }

  const anime = await fetchAnime(animeId);

  if (!anime) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "1200px",
            height: "630px",
            display: "flex",
            background: "#0a0a0a",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ color: "#e5e5e5", fontSize: 48, fontWeight: 700 }}>
            thesupersuperanime
          </div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }

  const { text: title, fontSize: titleFontSize } = getTitleDisplay(
    anime.title.english ?? anime.title.romaji ?? "Anime",
  );
  const coverImage = anime.coverImage.extraLarge || anime.coverImage.large || "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "row",
          position: "relative",
          background: "#0a0a0a",
          fontFamily: "sans-serif",
        }}
      >
        {/* Background layer */}
        {coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImage}
            alt=""
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "1200px",
              height: "630px",
              objectFit: "cover",
              opacity: 0.15,
            }}
          />
        )}

        {/* Dark overlay */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "1200px",
            height: "630px",
            background:
              "linear-gradient(to right, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 100%)",
          }}
        />

        {/* Content layer */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "1200px",
            height: "630px",
            display: "flex",
            flexDirection: "row",
            padding: "60px",
            gap: "48px",
            alignItems: "center",
          }}
        >
          {/* Cover image */}
          {coverImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverImage}
              alt=""
              style={{
                width: "200px",
                height: "285px",
                borderRadius: 8,
                objectFit: "cover",
                border: "2px solid rgba(255,255,255,0.1)",
              }}
            />
          )}

          {/* Right column */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              height: "285px",
            }}
          >
            {/* Top block */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {ep && (
                <div
                  style={{
                    color: "#3b82f6",
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: 3,
                    marginBottom: 12,
                  }}
                >
                  {`EPISODE ${ep}`}
                </div>
              )}
              <div
                style={{
                  fontSize: titleFontSize,
                  fontWeight: 700,
                  color: "#ffffff",
                  lineHeight: 1.15,
                  maxWidth: "580px",
                }}
              >
                {title}
              </div>
            </div>

            {/* Bottom block */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {anime.averageScore && (
                  <div
                    style={{
                      display: "flex",
                      background: "#3b82f6",
                      color: "#ffffff",
                      padding: "4px 10px",
                      borderRadius: 6,
                      fontSize: 16,
                      fontWeight: 700,
                    }}
                  >
                    {`Score: ${(anime.averageScore / 10).toFixed(1)}`}
                  </div>
                )}
                {anime.format && (
                  <div style={{ color: "#888", fontSize: 14 }}>{anime.format}</div>
                )}
              </div>
              <div style={{ color: "#555", fontSize: 16, marginTop: 8 }}>
                thesupersuperanime.lol
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
