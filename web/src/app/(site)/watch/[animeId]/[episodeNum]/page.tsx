"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { AnilistMedia } from "@/lib/anilist";
import { getDisplayTitle } from "@/lib/anilist";
import { SourceLoader } from "@/components/player/source-loader";
import { EpisodeSidebar } from "@/components/watch/episode-sidebar";
import { WatchInfo } from "@/components/watch/watch-info";

export default function WatchPage() {
  const params = useParams();
  const router = useRouter();
  
  const animeId = Number(params.animeId);
  const episodeNum = Number(params.episodeNum);

  const [anime, setAnime] = useState<AnilistMedia | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isNaN(animeId) || isNaN(episodeNum)) {
      router.push("/");
      return;
    }

    async function fetchAnime() {
      try {
        const res = await fetch(`/api/anilist/${animeId}`);
        if (!res.ok) throw new Error("Failed to fetch anime");
        const data = await res.json();
        if (data.anime) {
          setAnime(data.anime);
        } else {
          router.push("/");
        }
      } catch (err) {
        console.error(err);
        router.push("/");
      } finally {
        setLoading(false);
      }
    }

    fetchAnime();
  }, [animeId, episodeNum, router]);

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto pt-4 md:pt-8" style={{ minHeight: "80vh" }}>
        <div className="skeleton" style={{ width: "100%", aspectRatio: "16/9", marginBottom: "24px" }} />
      </div>
    );
  }

  if (!anime) return null;

  const title = getDisplayTitle(anime.title);

  return (
    <div className="max-w-[1400px] mx-auto md:px-4 pt-0 md:pt-4 pb-12">
      <div className="flex flex-col md:flex-row gap-6">
        
        {/* Main Player Area */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="w-full bg-black md:rounded-lg overflow-hidden shadow-xl" style={{ border: "1px solid #2a2a2a" }}>
            <SourceLoader 
              animeId={animeId} 
              episodeNum={episodeNum} 
              animeTitle={title} 
            />
          </div>
          
          <div className="hidden md:block">
            <WatchInfo anime={anime} episodeNum={episodeNum} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full md:w-[320px] lg:w-[380px] flex-shrink-0">
          <div className="bg-[#1a1a1a] md:border border-[#2a2a2a] md:rounded-lg overflow-hidden" style={{ maxHeight: "calc(100vh - 100px)", display: "flex", flexDirection: "column" }}>
            <div className="p-4 border-b border-[#2a2a2a] hidden md:block flex-shrink-0">
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "16px", fontWeight: 600, color: "#e5e5e5" }}>
                Episodes
              </h2>
            </div>
            <div className="overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              <EpisodeSidebar 
                totalEpisodes={anime.episodes} 
                nextAiringEpisode={anime.nextAiringEpisode?.episode} 
                currentEpisode={episodeNum} 
                animeId={animeId} 
              />
            </div>
          </div>
        </div>

        {/* Mobile Info (shows below sidebar on mobile) */}
        <div className="md:hidden">
          <WatchInfo anime={anime} episodeNum={episodeNum} />
        </div>
      </div>
    </div>
  );
}
