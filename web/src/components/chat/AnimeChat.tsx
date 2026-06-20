"use client";

import { useState, useEffect } from "react";
import { ChatPanel } from "./ChatPanel";

// Thin wrapper around ChatPanel for a per-anime room. Resolves admin status
// client-side via /api/auth/me; currentUserId is passed from the server
// component that renders it.
export function AnimeChat({
  animeId,
  currentUserId,
}: {
  animeId: number;
  currentUserId?: string;
}) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.isAdmin) setIsAdmin(true);
      })
      .catch(() => {});
  }, []);

  return (
    <ChatPanel
      roomId={`anime-${animeId}`}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      height={320}
      placeholder="Chat about this anime..."
    />
  );
}
