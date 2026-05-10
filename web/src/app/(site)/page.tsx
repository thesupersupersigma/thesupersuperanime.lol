import { Suspense } from "react";
import { getTrending, getSeasonal } from "@/lib/anilist";
import { AnimeCard, AnimeRowSkeleton } from "@/components/anime-card";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "thesupersuperanime — Home",
  description: "Watch anime. No ads, no bullshit.",
};

export default function HomePage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* Continue Watching */}
      <Section title="Continue Watching">
        <div
          style={{
            padding: "32px 0",
            textAlign: "center",
            color: "#444",
            fontSize: "13px",
          }}
        >
          Nothing here yet. Start watching something.
        </div>
      </Section>

      {/* Trending Now */}
      <Section title="Trending Now">
        <Suspense fallback={<AnimeRowSkeleton count={10} />}>
          <TrendingRow />
        </Suspense>
      </Section>

      {/* This Season */}
      <Section title="This Season">
        <Suspense fallback={<AnimeRowSkeleton count={10} />}>
          <SeasonalRow />
        </Suspense>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "16px",
          fontWeight: 600,
          color: "#e5e5e5",
          marginBottom: "12px",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

async function TrendingRow() {
  const trending = await getTrending(1, 20);

  return (
    <div className="scroll-row">
      {trending.slice(0, 10).map((anime) => (
        <div key={anime.id} style={{ width: "160px", minWidth: "140px", flexShrink: 0 }}>
          <AnimeCard anime={anime} />
        </div>
      ))}
    </div>
  );
}

async function SeasonalRow() {
  const seasonal = await getSeasonal(1, 20);

  return (
    <div className="scroll-row">
      {seasonal.slice(0, 10).map((anime) => (
        <div key={anime.id} style={{ width: "160px", minWidth: "140px", flexShrink: 0 }}>
          <AnimeCard anime={anime} />
        </div>
      ))}
    </div>
  );
}
