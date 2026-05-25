"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/search-bar";
import { AnimeCard, AnimeCardSkeleton, type WatchlistStatus } from "@/components/anime-card";
import type { AnilistSearchResult } from "@/lib/anilist";

// ── Static filter options ────────────────────────────────────────────────────

const GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Horror",
  "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance",
  "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller",
];

const SEASONS = [
  { value: "WINTER", label: "Winter" },
  { value: "SPRING", label: "Spring" },
  { value: "SUMMER", label: "Summer" },
  { value: "FALL",   label: "Fall"   },
];

const FORMATS = [
  { value: "TV",      label: "TV"      },
  { value: "MOVIE",   label: "Movie"   },
  { value: "OVA",     label: "OVA"     },
  { value: "ONA",     label: "ONA"     },
  { value: "SPECIAL", label: "Special" },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1999 }, (_, i) => CURRENT_YEAR - i);

// ── Shared select style ──────────────────────────────────────────────────────

const CHEVRON_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`;

function filterSelectStyle(active: boolean): React.CSSProperties {
  return {
    background: "#1a1a1a",
    border: `1px solid ${active ? "#3b82f6" : "#2a2a2a"}`,
    color: active ? "#e5e5e5" : "#666",
    padding: "7px 30px 7px 12px",
    borderRadius: "6px",
    fontSize: "13px",
    cursor: "pointer",
    outline: "none",
    appearance: "none" as const,
    backgroundImage: CHEVRON_SVG,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 9px center",
    backgroundSize: "12px",
    minWidth: "116px",
  };
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Filters {
  genre: string;
  season: string;
  year: string;
  format: string;
}

const EMPTY_FILTERS: Filters = { genre: "", season: "", year: "", format: "" };

// ── Main component ───────────────────────────────────────────────────────────

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  const [results, setResults]           = useState<AnilistSearchResult[]>([]);
  const [trending, setTrending]         = useState<AnilistSearchResult[]>([]);
  const [loading, setLoading]           = useState(false);
  const [hasSearched, setHasSearched]   = useState(false);
  const [filters, setFilters]           = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen]   = useState(false);
  const [watchlistMap, setWatchlistMap] = useState<Map<number, WatchlistStatus>>(new Map());

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const hasActiveFilters  = activeFilterCount > 0;

  // Fetch trending once for the empty state
  useEffect(() => {
    fetch("/api/anilist/trending")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setTrending(d.media || []); })
      .catch(() => {});
  }, []);

  // Fetch watchlist once on mount to overlay status badges on cards
  useEffect(() => {
    fetch("/api/watchlist")
      .then(r => {
        if (!r.ok) { console.warn("[SearchWatchlist] /api/watchlist responded", r.status); return null; }
        return r.json();
      })
      .then(d => {
        console.log("[SearchWatchlist] /api/watchlist raw response:", d);
        if (!d?.entries?.length) {
          console.log("[SearchWatchlist] No entries — entries:", d?.entries);
          return;
        }
        const m = new Map<number, WatchlistStatus>();
        for (const e of d.entries) {
          if (e.status) m.set(Number(e.animeId), e.status as WatchlistStatus);
        }
        console.log("[SearchWatchlist] Status map built:", Object.fromEntries(m));
        setWatchlistMap(m);
      })
      .catch(err => console.error("[SearchWatchlist] Fetch failed:", err));
  }, []);

  const performSearch = useCallback(async (q: string, f: Filters) => {
    const hasQuery   = q.trim().length > 0;
    const hasFilter  = Object.values(f).some(Boolean);

    if (!hasQuery && !hasFilter) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      const params = new URLSearchParams();
      if (q.trim())  params.set("q",      q.trim());
      if (f.genre)   params.set("genre",  f.genre);
      if (f.season)  params.set("season", f.season);
      if (f.year)    params.set("year",   f.year);
      if (f.format)  params.set("format", f.format);

      const res = await fetch(`/api/anilist/search?${params}`);
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

  // Re-run whenever the URL query or any filter changes
  useEffect(() => {
    performSearch(query, filters);
  }, [query, filters, performSearch]);

  function setFilter(key: keyof Filters, value: string) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  const sectionTitle = !hasSearched
    ? "Trending Anime"
    : query
    ? `Results for "${query}"`
    : "Filter Results";

  const displayResults = hasSearched ? results : trending;

  return (
    <div>
      {/* Search bar */}
      <div style={{ marginBottom: "12px" }} className="mobile-search-visible">
        <Suspense fallback={null}>
          <SearchBar placeholder="Search anime..." />
        </Suspense>
      </div>

      {/* Filter toggle + bar */}
      <div style={{ marginBottom: "24px" }}>
        <button
          onClick={() => setFiltersOpen(o => !o)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: hasActiveFilters ? "rgba(59,130,246,0.1)" : "#111",
            border: `1px solid ${hasActiveFilters ? "#3b82f6" : "#2a2a2a"}`,
            color: hasActiveFilters ? "#93c5fd" : "#a3a3a3",
            padding: "7px 14px",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 500,
            cursor: "pointer",
            transition: "border-color 0.15s, color 0.15s",
          }}
        >
          {/* Filter icon */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span style={{
              background: "#3b82f6", color: "#fff",
              fontSize: "11px", fontWeight: 700,
              padding: "1px 6px", borderRadius: "10px",
              lineHeight: "1.4",
            }}>
              {activeFilterCount}
            </span>
          )}
          {/* Chevron */}
          <svg
            width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: filtersOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {filtersOpen && (
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "10px",
            marginTop: "10px",
            padding: "14px 16px",
            background: "#111",
            border: "1px solid #2a2a2a",
            borderRadius: "8px",
          }}>
            {/* Genre */}
            <select
              value={filters.genre}
              onChange={e => setFilter("genre", e.target.value)}
              style={filterSelectStyle(!!filters.genre)}
            >
              <option value="">Genre</option>
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>

            {/* Season */}
            <select
              value={filters.season}
              onChange={e => setFilter("season", e.target.value)}
              style={filterSelectStyle(!!filters.season)}
            >
              <option value="">Season</option>
              {SEASONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>

            {/* Year */}
            <select
              value={filters.year}
              onChange={e => setFilter("year", e.target.value)}
              style={filterSelectStyle(!!filters.year)}
            >
              <option value="">Year</option>
              {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>

            {/* Format */}
            <select
              value={filters.format}
              onChange={e => setFilter("format", e.target.value)}
              style={filterSelectStyle(!!filters.format)}
            >
              <option value="">Format</option>
              {FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>

            {/* Clear all */}
            {hasActiveFilters && (
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#555",
                  fontSize: "12px",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  transition: "color 0.15s",
                  marginLeft: "2px",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "#a3a3a3")}
                onMouseLeave={e => (e.currentTarget.style.color = "#555")}
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Section label */}
      <h2 style={{
        fontFamily: "'Syne', sans-serif",
        fontSize: "15px",
        fontWeight: 600,
        color: "#888",
        marginBottom: "16px",
        letterSpacing: "-0.01em",
      }}>
        {sectionTitle}
      </h2>

      {/* Results grid */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "16px" }}>
          {Array.from({ length: 12 }).map((_, i) => <AnimeCardSkeleton key={i} />)}
        </div>
      ) : displayResults.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "16px" }}>
          {displayResults.map(anime => (
            <AnimeCard
              key={anime.id}
              anime={anime}
              showGenres
              watchlistStatus={watchlistMap.get(anime.id)}
            />
          ))}
        </div>
      ) : hasSearched ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: "#444", fontSize: "13px" }}>
          {query
            ? <>No results found for &quot;{query}&quot;</>
            : "No anime found matching these filters."}
        </div>
      ) : null}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "16px", paddingTop: "80px" }}>
          {Array.from({ length: 12 }).map((_, i) => <AnimeCardSkeleton key={i} />)}
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
