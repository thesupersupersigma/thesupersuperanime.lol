"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  followingId: string;
  initialIsFollowing: boolean;
  viewerId: string | null;
}

export function FollowButton({ followingId, initialIsFollowing, viewerId }: Props) {
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    // Not logged in — send them to sign in.
    if (!viewerId) {
      router.push("/account");
      return;
    }
    if (busy) return;

    // Optimistic toggle
    const next = !isFollowing;
    setIsFollowing(next);
    setBusy(true);
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followingId }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setIsFollowing(Boolean(data.following));
      router.refresh();
    } catch {
      // Revert on failure
      setIsFollowing(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      style={{
        background: isFollowing ? "none" : "#2563eb",
        border: isFollowing ? "1px solid #2a2a2a" : "1px solid #2563eb",
        color: isFollowing ? "#a3a3a3" : "#fff",
        padding: "7px 18px",
        borderRadius: "8px",
        fontSize: "13px",
        fontWeight: 600,
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.7 : 1,
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {isFollowing ? "Following" : "Follow"}
    </button>
  );
}
