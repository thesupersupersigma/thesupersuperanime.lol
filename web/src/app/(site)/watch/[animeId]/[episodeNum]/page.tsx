import type { Metadata } from "next";
import { getAnimeById, getDisplayTitle } from "@/lib/anilist";
import WatchClient from "./watch-client";

interface PageProps {
  params: Promise<{ animeId: string; episodeNum: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { animeId, episodeNum } = await params;
  const anime = await getAnimeById(Number(animeId));

  const title = anime ? getDisplayTitle(anime.title) : "Anime";
  const pageTitle = `Watch ${title} Episode ${episodeNum} — thesupersuperanime`;
  const description = anime
    ? `${title} Episode ${episodeNum} — Watch online in sub and dub on thesupersuperanime`
    : `Episode ${episodeNum} — Watch online in sub and dub on thesupersuperanime`;
  const url = `https://www.thesupersuperanime.lol/watch/${animeId}/${episodeNum}`;
  const ogImageUrl = `https://www.thesupersuperanime.lol/api/og?animeId=${animeId}&ep=${episodeNum}`;

  return {
    title: pageTitle,
    description,
    openGraph: {
      title: pageTitle,
      description,
      url,
      siteName: "thesupersuperanime",
      type: "video.other",
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function WatchPage({ params }: PageProps) {
  const { animeId, episodeNum } = await params;
  const anime = await getAnimeById(Number(animeId));

  const title = anime ? getDisplayTitle(anime.title) : "Anime";
  const description = anime
    ? `${title} Episode ${episodeNum} — Watch online in sub and dub on thesupersuperanime`
    : `Episode ${episodeNum} — Watch online in sub and dub on thesupersuperanime`;
  const url = `https://www.thesupersuperanime.lol/watch/${animeId}/${episodeNum}`;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: `Watch ${title} Episode ${episodeNum}`,
    description,
    url,
    embedUrl: url,
  };

  if (anime) {
    jsonLd.thumbnailUrl = anime.bannerImage || anime.coverImage.extraLarge;
    jsonLd.partOfSeries = {
      "@type": "TVSeries",
      name: title,
      url: `https://www.thesupersuperanime.lol/anime/${animeId}`,
    };
  }

  if (anime?.startDate?.year != null && anime.startDate?.month != null && anime.startDate?.day != null) {
    const { year, month, day } = anime.startDate;
    jsonLd.uploadDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <WatchClient />
    </>
  );
}
