import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { getTrending, getSeasonal, getDisplayTitle } from "@/lib/anilist";
import { AnimeRowSkeleton } from "@/components/anime-card";
import { WatchlistAwareRow } from "@/components/watchlist-aware-row";
import { ContinueWatching } from "@/components/continue-watching";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "thesupersuperanime — Home",
  description: "Watch anime. No ads, no bullshit.",
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

  const randomIndex = Math.floor(Math.random() * trending.length);
  const anime = trending[randomIndex];
  const title = getDisplayTitle(anime.title);
  const description = anime.description?.replace(/<[^>]*>?/gm, '') || "No description available.";

  return (
    <div style={{
      position: "relative",
      width: "100%",
      height: "50vh",
      minHeight: "400px",
      display: "flex",
      alignItems: "flex-end",
      overflow: "hidden",
      borderRadius: "12px",
      border: "1px solid #2a2a2a",
      backgroundColor: "#0a0a0a"
    }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <Image
          src={anime.bannerImage || anime.coverImage.extraLarge || anime.coverImage.large}
          alt={title}
          fill
          style={{ objectFit: "cover", opacity: 0.5 }}
          priority
        />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to top, #0a0a0a 0%, transparent 100%)"
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to right, #0a0a0a 0%, transparent 100%)",
          opacity: 0.8
        }} />
      </div>
      <div style={{ position: "relative", zIndex: 10, padding: "32px", maxWidth: "800px" }}>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "36px", fontWeight: 700,
          color: "#fff", marginBottom: "12px",
          letterSpacing: "-0.02em"
        }}>
          {title}
        </h1>
        <p style={{
          color: "#a3a3a3", fontSize: "14px", lineHeight: "1.6",
          display: "-webkit-box", WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical", overflow: "hidden",
          marginBottom: "24px"
        }}>
          {description}
        </p>
        <Link href={`/anime/${anime.id}`} style={{
          background: "#e5e5e5", color: "#0a0a0a",
          padding: "10px 24px", borderRadius: "6px",
          fontWeight: 600, textDecoration: "none",
          fontSize: "14px", display: "inline-block",
        }}>
          Watch Now
        </Link>
      </div>
    </div>
  );
}

async function TrendingRow() {
  const trending = await getTrending(1, 20);
  return <WatchlistAwareRow anime={trending.slice(0, 10)} />;
}

async function SeasonalRow() {
  const seasonal = await getSeasonal(1, 20);
  return <WatchlistAwareRow anime={seasonal.slice(0, 10)} />;
}