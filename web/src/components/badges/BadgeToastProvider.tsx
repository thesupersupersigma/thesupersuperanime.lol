"use client";

import { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import { BadgeToast, type ToastBadge } from "./BadgeToast";

const SEEN_KEY = "seenBadges";
const POLL_INTERVAL = 30_000;

interface RecentBadge {
  id: string;
  badge: { slug: string; name: string; icon: string; rarity: string };
}

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(set: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
  } catch {
    // ignore quota / unavailable storage
  }
}

/**
 * Wraps the app and surfaces "Badge Earned!" toasts. Polls `/api/badges/recent`
 * every 30s, diffs the result against a localStorage-backed seen-set (keyed by
 * UserBadge id), and toasts anything new. Auth-gated route → no-ops for guests.
 */
export function BadgeToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastBadge[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/badges/recent");
        if (!res.ok) return;
        const data = (await res.json()) as RecentBadge[];
        if (cancelled || !Array.isArray(data) || data.length === 0) return;

        const seen = readSeen();
        const fresh = data.filter((b) => b?.id && !seen.has(b.id));
        if (fresh.length === 0) return;

        // Mark as seen immediately so a later poll (or refresh) won't re-toast.
        fresh.forEach((b) => seen.add(b.id));
        writeSeen(seen);

        setToasts((prev) => [
          ...prev,
          ...fresh.map((b) => ({
            id: b.id,
            slug: b.badge.slug,
            name: b.badge.name,
            icon: b.badge.icon,
            rarity: b.badge.rarity,
          })),
        ]);
      } catch {
        // network hiccup — try again next interval
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <>
      {children}
      {toasts.length > 0 &&
        ReactDOM.createPortal(
          <div
            style={{
              position: "fixed",
              bottom: "24px",
              right: "24px",
              zIndex: 9999,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "8px",
            }}
          >
            {toasts.map((t) => (
              <BadgeToast key={t.id} badge={t} onDone={() => remove(t.id)} />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

export default BadgeToastProvider;
