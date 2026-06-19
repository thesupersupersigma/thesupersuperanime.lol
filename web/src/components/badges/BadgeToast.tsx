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
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Slide in on the next frame so the initial off-screen transform paints first.
    const raf = requestAnimationFrame(() => setShown(true));
    const dismiss = window.setTimeout(() => setLeaving(true), 4000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(dismiss);
    };
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(onDone, 300);
    return () => clearTimeout(t);
  }, [leaving, onDone]);

  const color = RARITY_COLOR[badge.rarity] ?? RARITY_COLOR.common;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "14px 18px",
        borderRadius: "12px",
        background: "#111",
        border: "1px solid #2a2a2a",
        minWidth: "260px",
        maxWidth: "320px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        transform: shown && !leaving ? "translateX(0)" : "translateX(120%)",
        opacity: leaving ? 0 : 1,
        transition: "transform 0.3s ease, opacity 0.3s ease",
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
