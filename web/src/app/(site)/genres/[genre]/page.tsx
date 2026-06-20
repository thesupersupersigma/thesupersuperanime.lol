import { notFound } from "next/navigation";
import Link from "next/link";
import { getAnimeByGenre } from "@/lib/anilist";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { GenreVoteList } from "./genre-vote-list";
import type { Metadata } from "next";
import { ANILIST_GENRES } from "@/lib/genres";

interface Props {
  params: Promise<{ genre: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { genre } = await params;
  const decoded = decodeURIComponent(genre);
  return {
    title: `${decoded} Anime — thesupersuperanime`,
    description: `Top-ranked ${decoded} anime, sorted by score and community votes.`,
  };
}

export default async function GenrePage({ params }: Props) {
  const { genre: rawGenre } = await params;
  const genre = decodeURIComponent(rawGenre);

  // Validate genre against known list
  if (!(ANILIST_GENRES as readonly string[]).includes(genre)) notFound();

  // Fetch anime + votes in parallel
  const [animeList, user] = await Promise.all([
    getAnimeByGenre(genre, 50),
    getCurrentUser(),
  ]);

  // Get vote counts for all fetched anime in this genre
  const animeIds = animeList.map(a => a.id);
  const votes = await db.genreVote.groupBy({
    by: ["animeId"],
    where: { animeId: { in: animeIds }, genre },
    _count: { _all: true },
  });
  const voteMap = new Map(votes.map(v => [v.animeId, v._count._all]));

  // Get current user's votes for this genre
  const userVotedIds: number[] = user
    ? (await db.genreVote.findMany({
        where: { userId: user.id, animeId: { in: animeIds }, genre },
        select: { animeId: true },
      })).map(v => v.animeId)
    : [];

  // Community ranking — sorted by vote count only
  const communityRanked = animeList
    .map(anime => ({
      anime,
      voteCount: voteMap.get(anime.id) ?? 0,
      score: voteMap.get(anime.id) ?? 0,
    }))
    .sort((a, b) => b.voteCount - a.voteCount)
    .slice(0, 10);

  // Overall ranking — composite score, take top 10
  const overallRanked = animeList
    .map(anime => ({
      anime,
      voteCount: voteMap.get(anime.id) ?? 0,
      score: (anime.averageScore ?? 0) * 10 + (voteMap.get(anime.id) ?? 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", paddingBottom: "48px" }}>
      {/* Breadcrumb */}
      <nav style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#555" }}>
        <Link href="/genres" className="breadcrumb-link">
          Genres
        </Link>
        <span>/</span>
        <span style={{ color: "#e5e5e5" }}>{genre}</span>
      </nav>

      {/* Header */}
      <div>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "28px",
          fontWeight: 700,
          color: "#e5e5e5",
          letterSpacing: "-0.02em",
          marginBottom: "6px",
        }}>
          {genre}
        </h1>
        <p style={{ color: "#555", fontSize: "13px" }}>
          Top 10 ranked by AniList score + community votes.{" "}
          {!user && (
            <Link href="/account" style={{ color: "#3b82f6", textDecoration: "none" }}>
              Log in to vote.
            </Link>
          )}
        </p>
      </div>

      {communityRanked.length === 0 ? (
        <p style={{ color: "#555", fontSize: "14px" }}>No anime found for this genre.</p>
      ) : (
        <GenreVoteList
          communityRanked={communityRanked}
          overallRanked={overallRanked}
          genre={genre}
          userVotedIds={userVotedIds}
          isLoggedIn={!!user}
        />
      )}
    </div>
  );
}
