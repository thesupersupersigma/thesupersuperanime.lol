"use client";

import { useEffect, useState } from "react";

export interface ToastBadge {
  id: string;
  slug: string;
  name: string;
  icon: string;
  rarity: string;
}

const RARITY_COLOR: Record<string, string> = {
  legendary: "#facc15",
  epic: "#a855f7",
  rare: "#3b82f6",
  common: "#a3a3a3",
};

/**
 * A single "Badge Earned!" toast. Slides in from the right on mount, auto-fades
 * after 4s, then calls `onDone` once the exit transition has finished so the
 * provider can drop it from the stack.
 */
export function BadgeToast({ badge, onDone }: { badge: ToastBadge; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Fire a confetti burst for rare+ badges, dynamically importing the lib so it
    // never lands in the initial bundle. Origin is near the bottom-right toast.
    if (badge.rarity === "legendary" || badge.rarity === "epic" || badge.rarity === "rare") {
      import("canvas-confetti")
        .then(({ default: confetti }) => {
          const colors =
            badge.rarity === "legendary"
              ? ["#facc15", "#fbbf24", "#f59e0b", "#fff"]
              : badge.rarity === "epic"
              ? ["#a855f7", "#9333ea", "#c084fc", "#fff"]
              : ["#3b82f6", "#2563eb", "#60a5fa", "#fff"];

          confetti({
            particleCount: badge.rarity === "legendary" ? 120 : badge.rarity === "epic" ? 80 : 50,
            spread: 70,
            origin: { x: 0.85, y: 0.85 },
            colors,
            scalar: 0.9,
            gravity: 1.2,
          });
        })
        .catch(() => {});
    }

    const dismiss = window.setTimeout(() => setLeaving(true), 4000);
    return () => {
      clearTimeout(dismiss);
    };
  }, [badge.rarity]);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(onDone, 300);
    return () => clearTimeout(t);
  }, [leaving, onDone]);

  const color = RARITY_COLOR[badge.rarity] ?? RARITY_COLOR.common;

  return (
    <div
      className="animate-pop-in"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "14px 18px",
        borderRadius: "12px",
        background: "#111",
        border: "1px solid #2a2a2a",
        borderLeft: `3px solid ${color}`,
        minWidth: "260px",
        maxWidth: "320px",
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${color}22`,
        opacity: leaving ? 0 : 1,
        transition: "opacity 0.3s ease",
      }}
    >
      <div style={{ fontSize: "28px", lineHeight: 1, flexShrink: 0 }}>{badge.icon}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
        <span style={{ color: "#555", fontSize: "11px" }}>Badge Earned!</span>
        <span style={{ color, fontSize: "14px", fontWeight: 700 }}>{badge.name}</span>
      </div>
    </div>
  );
}

export default BadgeToast;
