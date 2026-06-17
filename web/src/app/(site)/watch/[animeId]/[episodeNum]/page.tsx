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

export default function WatchPage() {
  return <WatchClient />;
}
