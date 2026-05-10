"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/search-bar";
import { AnimeCard, AnimeCardSkeleton } from "@/components/anime-card";
import type { AnilistSearchResult } from "@/lib/anilist";
import type { Metadata } from "next";

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const [results, setResults] = useState<AnilistSearchResult[]>([]);
  const [trending, setTrending] = useState<AnilistSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Fetch trending on mount for empty state
  useEffect(() => {
    async function fetchTrending() {
      try {
        const res = await fetch("/api/anilist/trending");
        if (res.ok) {
          const data = await res.json();
          setTrending(data.media || []);
        }
      } catch {
        // silently fail — trending is just a suggestion
      }
    }
    fetchTrending();
  }, []);

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      const res = await fetch(
        `/api/anilist/search?q=${encodeURIComponent(q)}`
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.media || []);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    performSearch(query);
  }, [query, performSearch]);

  const displayResults = hasSearched ? results : trending;
  const sectionTitle = hasSearched
    ? `Results for "${query}"`
    : "Trending Anime";

  return (
    <div>
      {/* Search bar — prominent on mobile */}
      <div
        style={{
          marginBottom: "24px",
        }}
        className="mobile-search-visible"
      >
        <Suspense fallback={null}>
          <SearchBar placeholder="Search anime..." />
        </Suspense>
      </div>

      {/* Section label */}
      <h2
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "15px",
          fontWeight: 600,
          color: "#888",
          marginBottom: "16px",
          letterSpacing: "-0.01em",
        }}
      >
        {sectionTitle}
      </h2>

      {/* Results grid */}
      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "16px",
          }}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <AnimeCardSkeleton key={i} />
          ))}
        </div>
      ) : displayResults.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "16px",
          }}
        >
          {displayResults.map((anime) => (
            <AnimeCard key={anime.id} anime={anime} showGenres />
          ))}
        </div>
      ) : hasSearched ? (
        <div
          style={{
            padding: "48px 0",
            textAlign: "center",
            color: "#444",
            fontSize: "13px",
          }}
        >
          No results found for &quot;{query}&quot;
        </div>
      ) : null}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "16px",
            paddingTop: "80px",
          }}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <AnimeCardSkeleton key={i} />
          ))}
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
