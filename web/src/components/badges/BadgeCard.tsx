"use client";

import { useState, useRef } from "react";
import ReactDOM from "react-dom";

interface BadgeCardProps {
  slug: string;
  name: string;
  description: string;
  icon: string;
  rarity: string; // "common" | "rare" | "epic" | "legendary"
  rarityOrder: number;
  grantedAt: string; // ISO date string
  context?: string | null;
  /** Position in the grid — drives the staggered pop-in entrance delay */
  index?: number;
}

type Phase = "idle" | "flying-out" | "open" | "flying-back";

const RARITY_STYLES: Record<string, { background: string; border: string; color: string }> = {
  legendary: { background: "rgba(250, 204, 21, 0.1)", border: "1px solid rgba(250, 204, 21, 0.3)", color: "#facc15" },
  epic: { background: "rgba(168, 85, 247, 0.1)", border: "1px solid rgba(168, 85, 247, 0.3)", color: "#a855f7" },
  rare: { background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.3)", color: "#3b82f6" },
  common: { background: "rgba(255,255,255,0.05)", border: "1px solid #2a2a2a", color: "#a3a3a3" },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

const BACK_SIZE = 200; // px

export function BadgeCard({ slug, name, description, icon, rarity, grantedAt, context, index }: BadgeCardProps) {
  const rarityStyle = RARITY_STYLES[rarity] ?? RARITY_STYLES.common;
  const rarityLabel = (rarity ?? "common").toUpperCase();

  const [phase, setPhase] = useState<Phase>("idle");
  // The recorded position/size of the pill before the animation starts.
  const rectRef = useRef<DOMRect | null>(null);
  // Mirror of the recorded rect that drives rendering (kept in sync with the ref).
  const [rect, setRect] = useState<DOMRect | null>(null);
  // Drives the flying clone: starts at the pill rect, then animates to center.
  const [flying, setFlying] = useState(false);
  // 3D tilt for the open back face.
  const [tilt, setTilt] = useState<{ x: number; y: number; transition: boolean }>({ x: 0, y: 0, transition: false });

  const pillRef = useRef<HTMLSpanElement>(null);

  function openCard() {
    if (!pillRef.current) return;
    rectRef.current = pillRef.current.getBoundingClientRect();
    setRect(rectRef.current);
    setFlying(false);
    setPhase("flying-out");
    // Trigger the center animation on the next frame so the clone first renders
    // at the pill's position, then transitions to the viewport center.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setFlying(true));
    });
    // After the fly-out transition completes, reveal the back face.
    window.setTimeout(() => setPhase("open"), 600);
  }

  function closeCard() {
    // Animate the clone back to the pill's original position.
    setPhase("flying-back");
    setFlying(false);
    window.setTimeout(() => {
      setPhase("idle");
      rectRef.current = null;
      setRect(null);
    }, 500);
  }

  function handleTilt(e: React.MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = (e.clientX - cx) / (r.width / 2); // -1..1
    const dy = (e.clientY - cy) / (r.height / 2); // -1..1
    setTilt({ x: -dy * 15, y: dx * 15, transition: false });
  }

  function resetTilt() {
    setTilt({ x: 0, y: 0, transition: true });
  }

  const animating = phase !== "idle";

  // ── Flying clone geometry ────────────────────────────────────────────────
  // When `flying` is false, the clone sits exactly over the pill. When true,
  // it is translated to the viewport center, scaled up, and rotated on Y.
  let cloneTransform = "translate(0px, 0px) scale(1) rotateY(0deg)";
  if (rect && flying) {
    const pillCenterX = rect.left + rect.width / 2;
    const pillCenterY = rect.top + rect.height / 2;
    const viewCenterX = window.innerWidth / 2;
    const viewCenterY = window.innerHeight / 2;
    const dx = viewCenterX - pillCenterX;
    const dy = viewCenterY - pillCenterY;
    // Scale the pill up toward ~180px tall.
    const scale = rect.height ? 180 / rect.height : 6;
    cloneTransform = `translate(${dx}px, ${dy}px) scale(${scale}) rotateY(810deg)`;
  }

  const overlayVisible = phase === "flying-out" || phase === "open";

  const portal = animating && rect
    ? ReactDOM.createPortal(
        <>
          {/* Backdrop overlay */}
          <div
            onClick={closeCard}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9998,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              opacity: overlayVisible ? 1 : 0,
              transition: "opacity 0.5s ease",
            }}
          />

          {/* Flying clone of the pill (visible during fly-out / fly-back) */}
          {(phase === "flying-out" || phase === "flying-back") && (
            <div
              style={{
                position: "fixed",
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                zIndex: 9999,
                transformOrigin: "center center",
                transform: cloneTransform,
                transition: "all 0.6s cubic-bezier(0.34,1.56,0.64,1)",
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  width: "100%",
                  height: "100%",
                  boxSizing: "border-box",
                  padding: "6px 12px",
                  borderRadius: "20px",
                  fontSize: "13px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  background: rarityStyle.background,
                  border: rarityStyle.border,
                  color: rarityStyle.color,
                  backfaceVisibility: "hidden",
                }}
              >
                {icon} {name}
              </span>
            </div>
          )}

          {/* Back face (visible once the card has flipped open) */}
          {phase === "open" && (
            <div
              onClick={e => e.stopPropagation()}
              onMouseMove={handleTilt}
              onMouseLeave={resetTilt}
              style={{
                position: "fixed",
                left: "50%",
                top: "50%",
                marginLeft: -BACK_SIZE / 2,
                marginTop: -BACK_SIZE / 2,
                width: BACK_SIZE,
                height: BACK_SIZE,
                zIndex: 9999,
                borderRadius: "16px",
                background: `radial-gradient(circle at 50% 35%, ${rarityStyle.color}26, transparent 70%), #111`,
                border: "1px solid #2a2a2a",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "16px 0",
                boxSizing: "border-box",
                transform: `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                transition: tilt.transition ? "transform 0.3s ease" : undefined,
                cursor: "default",
              }}
            >
              <div style={{ fontSize: "48px", lineHeight: 1 }}>{icon}</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: rarityStyle.color, textAlign: "center", padding: "0 16px" }}>
                {name}
              </div>
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: rarityStyle.color,
                  opacity: 0.6,
                }}
              >
                {rarityLabel}
                {context ? ` · ${context}` : ""}
              </div>
              <div style={{ fontSize: "11px", color: "#555", textAlign: "center", padding: "0 16px" }}>
                {description}
              </div>
              <div style={{ fontSize: "10px", color: "#444", marginTop: "2px" }}>
                Earned {formatDate(grantedAt)}
              </div>
            </div>
          )}
        </>,
        document.body,
      )
    : null;

  return (
    <>
      <span
        ref={pillRef}
        onClick={openCard}
        title={description}
        data-badge-slug={slug}
        className="animate-pop-in"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 12px",
          borderRadius: "20px",
          fontSize: "13px",
          fontWeight: 600,
          whiteSpace: "nowrap",
          cursor: "pointer",
          background: rarityStyle.background,
          border: rarityStyle.border,
          color: rarityStyle.color,
          animationDelay: `${(index ?? 0) * 40}ms`,
          // Keep the layout slot while the badge is flying so nothing shifts.
          visibility: animating ? "hidden" : "visible",
        }}
      >
        {icon} {name}
      </span>
      {portal}
    </>
  );
}

export default BadgeCard;
