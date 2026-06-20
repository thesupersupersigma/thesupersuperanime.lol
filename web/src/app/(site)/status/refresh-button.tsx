"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Shows "Last updated Xs ago" and auto-refreshes the server component every 60s.
 * The countdown rebases (via a ref, not setState-in-effect) whenever the server
 * hands down a new `lastUpdated`.
 */
export function RefreshButton({ lastUpdated }: { lastUpdated: string }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);
  const baseRef = useRef(0);

  // Tick the visible counter every second; rebase whenever fresh data arrives.
  useEffect(() => {
    baseRef.current = Date.now();
    const tick = setInterval(() => {
      setSeconds(Math.floor((Date.now() - baseRef.current) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [lastUpdated]);

  // Pull fresh server data every 60 seconds.
  useEffect(() => {
    const refresh = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(refresh);
  }, [router]);

  return (
    <button
      onClick={() => router.refresh()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        background: "#111",
        border: "1px solid #2a2a2a",
        borderRadius: "8px",
        padding: "6px 12px",
        color: "#888",
        fontSize: "12px",
        cursor: "pointer",
      }}
    >
      <span>Updated {seconds}s ago</span>
      <span style={{ color: "#555" }}>·</span>
      <span style={{ color: "#3b82f6" }}>↻ Refresh</span>
    </button>
  );
}
