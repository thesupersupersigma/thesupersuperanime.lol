"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { AnilistMedia } from "@/lib/anilist";
import { getDisplayTitle } from "@/lib/anilist";
import { AnimePlayer, ServerData } from "@/components/player/anime-player";
import { EpisodeSidebar } from "@/components/watch/episode-sidebar";
import { WatchInfo } from "@/components/watch/watch-info";

export default function WatchPage() {
  const params = useParams();
  const router = useRouter();
  
  const animeId = Number(params.animeId);
  const episodeNum = Number(params.episodeNum);

  const [anime, setAnime] = useState<AnilistMedia | null>(null);
  const [servers, setServers] = useState<ServerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNaN(animeId) || isNaN(episodeNum)) {
      router.push("/");
      return;
    }

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch Anime Info from AniList
        const infoRes = await fetch(`/api/anilist/${animeId}`);
        if (!infoRes.ok) throw new Error("Failed to fetch anime info");
        const data = await infoRes.json();
        
        if (!data.anime) throw new Error("Anime not found");
        setAnime(data.anime);

        const animeTitle = getDisplayTitle(data.anime.title);

        // 2. Fetch the Servers from our new Dual-API Aggregator
        const sourceRes = await fetch("/api/source", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            animeId,
            episodeNum,
            animeTitle,
          }),
        });

        if (!sourceRes.ok) throw new Error("No playable streams found");
        
        const sourceData = await sourceRes.json();
        
        if (sourceData.servers && sourceData.servers.length > 0) {
          setServers(sourceData.servers);
        } else {
          throw new Error("No servers available for this episode.");
        }

      } catch (err: any) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [animeId, episodeNum, router]);

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto pt-4 md:pt-8" style={{ minHeight: "80vh" }}>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          <p>Scraping servers...</p>
        </div>
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a] text-white">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || "Something went wrong"}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-blue-600 px-4 py-2 rounded font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const title = getDisplayTitle(anime.title);

  return (
    <div className="max-w-[1400px] mx-auto md:px-4 pt-0 md:pt-4 pb-12">
      <div className="flex flex-col md:flex-row gap-6">
        
        {/* Main Player Area */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="w-full bg-black md:rounded-lg overflow-hidden shadow-xl" style={{ border: "1px solid #2a2a2a" }}>
            <AnimePlayer 
              servers={servers} 
              animeId={animeId} 
              episodeNum={episodeNum} 
              animeTitle={title} 
            />
          </div>
          
          <div className="hidden md:block mt-6">
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
        <div className="md:hidden mt-4">
          <WatchInfo anime={anime} episodeNum={episodeNum} />
        </div>
      </div>
    </div>
  );
}