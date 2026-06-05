import { ImageResponse } from "next/og";
import { getTrending } from "@/lib/anilist";

export const runtime = "edge";
export const revalidate = 3600;

export const alt = "thesupersuperanime";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  let imageUrl = "";

  try {
    const trending = await getTrending(1, 20);
    const pick = trending[Math.floor(Math.random() * trending.length)];
    imageUrl = pick?.bannerImage || pick?.coverImage?.extraLarge || "";
  } catch {
    imageUrl = "";
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          position: "relative",
          background: "#0a0a0a",
        }}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center top",
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "60%",
            background:
              "linear-gradient(to bottom, transparent, rgba(0,0,0,0.95))",
          }}
        />
        <div
          style={{
            position: "relative",
            padding: "0 64px 52px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div
            style={{
              fontSize: "52px",
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "-1px",
              lineHeight: 1,
            }}
          >
            thesupersuperanime
          </div>
          <div
            style={{
              fontSize: "24px",
              color: "rgba(255,255,255,0.7)",
              fontWeight: 400,
            }}
          >
            I solo every other site btw jus bcus im that goated
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
