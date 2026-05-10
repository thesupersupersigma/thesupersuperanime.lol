import Link from "next/link";
import Image from "next/image";
import {
  type AnilistMedia,
  type AnilistSearchResult,
  getDisplayTitle,
} from "@/lib/anilist";

type AnimeData = AnilistMedia | AnilistSearchResult;

interface AnimeCardProps {
  anime: AnimeData;
  /** Show genre tags under the title */
  showGenres?: boolean;
}

export function AnimeCard({ anime, showGenres = false }: AnimeCardProps) {
  const title = getDisplayTitle(anime.title);
  const score = anime.averageScore;

  return (
    <Link
      href={`/anime/${anime.id}`}
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        className="card-image-wrap"
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "3 / 4",
          borderRadius: "4px",
          overflow: "hidden",
          border: "1px solid #2a2a2a",
          background: "#1a1a1a",
          transition: "border-color 150ms ease",
        }}
      >
        <Image
          src={anime.coverImage.extraLarge || anime.coverImage.large}
          alt={title}
          fill
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 160px"
          style={{ objectFit: "cover" }}
        />

        {score && (
          <span
            style={{
              position: "absolute",
              top: "6px",
              right: "6px",
              background: "#3b82f6",
              color: "#fff",
              fontSize: "11px",
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: "3px",
              lineHeight: "1.4",
            }}
          >
            {(score / 10).toFixed(1)}
          </span>
        )}
      </div>

      <p
        style={{
          marginTop: "6px",
          fontSize: "13px",
          fontWeight: 500,
          color: "#e5e5e5",
          lineHeight: "1.3",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {title}
      </p>

      {showGenres && anime.genres.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px",
            marginTop: "4px",
          }}
        >
          {anime.genres.slice(0, 3).map((genre) => (
            <span
              key={genre}
              style={{
                background: "#2a2a2a",
                color: "#888",
                fontSize: "11px",
                padding: "1px 6px",
                borderRadius: "4px",
                lineHeight: "1.5",
              }}
            >
              {genre}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

// ── Skeleton ────────────────────────────────────

export function AnimeCardSkeleton() {
  return (
    <div style={{ minWidth: "140px", maxWidth: "180px" }}>
      <div
        className="skeleton"
        style={{
          aspectRatio: "3 / 4",
          borderRadius: "4px",
          width: "100%",
        }}
      />
      <div
        className="skeleton"
        style={{
          height: "14px",
          borderRadius: "3px",
          marginTop: "8px",
          width: "80%",
        }}
      />
      <div
        className="skeleton"
        style={{
          height: "10px",
          borderRadius: "3px",
          marginTop: "6px",
          width: "50%",
        }}
      />
    </div>
  );
}

/**
 * Skeleton row for the homepage scroll sections
 */
export function AnimeRowSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="scroll-row">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ minWidth: "140px", flexShrink: 0 }}>
          <AnimeCardSkeleton />
        </div>
      ))}
    </div>
  );
}
