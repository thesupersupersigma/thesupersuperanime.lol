import type { Metadata } from "next";
import { GenreGrid } from "./genre-grid";

export const metadata: Metadata = {
  title: "Browse by Genre — thesupersuperanime",
  description: "Explore anime by genre. Community-ranked top 10 lists for every genre.",
};

export default function GenresIndexPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", paddingBottom: "48px" }}>
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
          Browse by Genre
        </h1>
        <p style={{ color: "#555", fontSize: "13px" }}>
          Each genre page shows the top 10 anime ranked by AniList score and community votes.
        </p>
      </div>

      <GenreGrid />
    </div>
  );
}
