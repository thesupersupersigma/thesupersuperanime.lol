import { notFound } from "next/navigation";
import Image from "next/image";
import { getAnimeById, getDisplayTitle, getMainStudio } from "@/lib/anilist";
import { EpisodeList } from "@/components/episode-list";
import { WatchlistButton } from "./watchlist-button";
import type { Metadata } from "next";
import { NextEpisodeCountdown } from "@/components/next-episode-countdown";
import { Comments } from "@/components/comments";
import { getCurrentUser } from "@/lib/auth";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const anime = await getAnimeById(Number(id));
  if (!anime) return { title: "Not Found" };

  const title = getDisplayTitle(anime.title);
  return {
    title: `${title} — thesupersuperanime`,
    description:
      anime.description?.replace(/<[^>]*>/g, "").slice(0, 160) || undefined,
  };
}

export default async function AnimeDetailPage({ params }: PageProps) {
  const { id } = await params;
  
  // Fetch both anime and user data simultaneously
  const [anime, user] = await Promise.all([
    getAnimeById(Number(id)),
    getCurrentUser(),
  ]);

  if (!anime) notFound();

  const title = getDisplayTitle(anime.title);
  const studio = getMainStudio(anime.studios);
  const score = anime.averageScore;

  // Clean description — remove HTML tags from AniList
  const description = anime.description?.replace(/<[^>]*>/g, "") || null;

  return (
    <div>
      {/* Top section — cover + metadata */}
      <div
        className="anime-detail-top"
        style={{
          display: "flex",
          gap: "24px",
          marginBottom: "32px",
        }}
      >
        {/* Cover image */}
        <div
          className="anime-cover"
          style={{
            flexShrink: 0,
            width: "220px",
            borderRadius: "4px",
            overflow: "hidden",
            border: "1px solid #2a2a2a",
          }}
        >
          <Image
            src={anime.coverImage.extraLarge || anime.coverImage.large}
            alt={title}
            width={220}
            height={310}
            style={{ width: "100%", height: "auto", display: "block" }}
            priority
          />
        </div>

        {/* Metadata */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: "22px",
              fontWeight: 700,
              color: "#e5e5e5",
              marginBottom: "8px",
              letterSpacing: "-0.02em",
              lineHeight: "1.2",
            }}
          >
            {title}
          </h1>

          {/* Alt title */}
          {anime.title.romaji && anime.title.romaji !== title && (
            <p
              style={{
                fontSize: "13px",
                color: "#666",
                marginBottom: "12px",
              }}
            >
              {anime.title.romaji}
            </p>
          )}

          {/* Metadata row */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
            }}
          >
            {score && (
              <span
                style={{
                  background: "#3b82f6",
                  color: "#fff",
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "4px",
                }}
              >
                {(score / 10).toFixed(1)}
              </span>
            )}

            {anime.format && (
              <MetaBadge>{formatLabel(anime.format)}</MetaBadge>
            )}

            {anime.status && (
              <MetaBadge>{formatStatus(anime.status)}</MetaBadge>
            )}

            {anime.episodes && (
              <MetaBadge>{anime.episodes} eps</MetaBadge>
            )}

            {studio && <MetaBadge>{studio}</MetaBadge>}

            {anime.seasonYear && anime.season && (
              <MetaBadge>
                {anime.season.charAt(0) +
                  anime.season.slice(1).toLowerCase()}{" "}
                {anime.seasonYear}
              </MetaBadge>
            )}
          </div>

          {/* Genre tags */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
              marginBottom: "16px",
            }}
          >
            {anime.genres.map((genre) => (
              <span
                key={genre}
                style={{
                  background: "#2a2a2a",
                  color: "#888",
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "4px",
                }}
              >
                {genre}
              </span>
            ))}
          </div>

          {/* Next episode countdown — only shows for currently airing anime */}
          {anime.nextAiringEpisode && (
            <div style={{ marginBottom: "16px" }}>
              <NextEpisodeCountdown
                episode={anime.nextAiringEpisode.episode}
                airingAt={anime.nextAiringEpisode.airingAt}
              />
            </div>
          )}

          {/* Description */}
          {description && <ExpandableDescription text={description} />}

          {/* Watchlist button */}
          <div style={{ marginTop: "16px" }}>
            <WatchlistButton animeId={anime.id} title={title} />
          </div>
        </div>
      </div>

      {/* Episode list */}
      <section>
        <h2
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "16px",
            fontWeight: 600,
            color: "#e5e5e5",
            marginBottom: "12px",
          }}
        >
          Episodes
        </h2>
        <EpisodeList
          animeId={anime.id}
          totalEpisodes={anime.episodes}
          nextAiringEpisode={anime.nextAiringEpisode?.episode}
        />
      </section>

      {/* Comments Section */}
      <section style={{ marginTop: "40px" }}>
        <h2
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "16px",
            fontWeight: 600,
            color: "#e5e5e5",
            marginBottom: "12px",
          }}
        >
          Comments
        </h2>
        <Comments animeId={anime.id} currentUserId={user?.id} />
      </section>
    </div>
  );
}

// ── Sub-components ──────────────────────────────

function MetaBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        color: "#888",
        fontSize: "12px",
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}

function ExpandableDescription({ text }: { text: string }) {
  const isLong = text.length > 300;

  return (
    <details
      style={{ fontSize: "13px", lineHeight: "1.6", color: "#aaa" }}
      open={!isLong}
    >
      <summary
        style={{
          cursor: isLong ? "pointer" : "default",
          listStyle: "none",
          display: isLong ? "block" : "none",
          color: "#3b82f6",
          fontSize: "12px",
          marginTop: "4px",
          fontWeight: 500,
        }}
      >
        {isLong ? "Show more" : ""}
      </summary>
      <p style={{ margin: 0 }}>{text}</p>
    </details>
  );
}

// ── Helpers ─────────────────────────────────────

function formatLabel(format: string): string {
  const map: Record<string, string> = {
    TV: "TV",
    TV_SHORT: "TV Short",
    MOVIE: "Movie",
    SPECIAL: "Special",
    OVA: "OVA",
    ONA: "ONA",
    MUSIC: "Music",
  };
  return map[format] || format;
}

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    FINISHED: "Finished",
    RELEASING: "Airing",
    NOT_YET_RELEASED: "Upcoming",
    CANCELLED: "Cancelled",
    HIATUS: "Hiatus",
  };
  return map[status] || status;
}