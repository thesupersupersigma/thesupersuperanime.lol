import { Suspense } from "react";
import { getTrending, getSeasonal } from "@/lib/anilist";
import { AnimeRowSkeleton } from "@/components/anime-card";
import { WatchlistAwareRow } from "@/components/watchlist-aware-row";
import { ContinueWatching } from "@/components/continue-watching";
import { HeroCarousel } from "@/components/hero-carousel";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "thesupersuperanime — Home",
  description: "I solo every other site btw jus bcus im that goated",
};

export default function HomePage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px", paddingBottom: "48px" }}>

      <Suspense fallback={<div style={{ height: "50vh", minHeight: "400px", width: "100%", background: "#111", borderRadius: "8px" }} />}>
        <HeroBanner />
      </Suspense>

      {/* Continue Watching — client component, fetches per-user data */}
      <Section title="Continue Watching">
        <ContinueWatching />
      </Section>

      <Section title="Trending Now">
        <Suspense fallback={<AnimeRowSkeleton count={10} />}>
          <TrendingRow />
        </Suspense>
      </Section>

      <Section title="This Season">
        <Suspense fallback={<AnimeRowSkeleton count={10} />}>
          <SeasonalRow />
        </Suspense>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{
        fontFamily: "'Syne', sans-serif",
        fontSize: "16px",
        fontWeight: 600,
        color: "#e5e5e5",
        marginBottom: "12px",
        letterSpacing: "-0.01em",
      }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

async function HeroBanner() {
  const trending = await getTrending(1, 10);
  if (!trending || trending.length === 0) return null;

  // Use the first 6 trending titles as carousel slides.
  // getTrending(1, 10) is already called by TrendingRow with a larger limit,
  // so this fetch is deduplicated by Next.js's built-in request memoisation.
  const slides = trending.slice(0, 6);

  return <HeroCarousel slides={slides} />;
}

async function TrendingRow() {
  const trending = await getTrending(1, 20);
  return <WatchlistAwareRow anime={trending.slice(0, 10)} />;
}

async function SeasonalRow() {
  const seasonal = await getSeasonal(1, 20);
  return <WatchlistAwareRow anime={seasonal.slice(0, 10)} />;
}