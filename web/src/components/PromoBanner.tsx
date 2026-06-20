"use client";

import { useEffect, useState, startTransition } from "react";

const DISMISS_KEY = "promoBannerDismissed";
const VARIANT_KEY = "promoBannerVariant";
const DISMISS_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

const VARIANTS = [
  {
    text: "Enjoying the site? Share it with a friend.",
    cta: "Copy Link",
    ctaAction: "copy" as const,
  },
  {
    text: "Join the community on Discord — discuss anime, get notified of new episodes.",
    cta: "Join Discord",
    ctaAction: "discord" as const,
  },
  {
    text: "Found a bug or have a suggestion? Let us know.",
    cta: "Report Issue",
    ctaAction: "issues" as const,
  },
  {
    text: "Track your watch history, earn badges, and climb the leaderboard.",
    cta: "Create Account",
    ctaAction: "account" as const,
  },
];

export function PromoBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [variantIndex, setVariantIndex] = useState(0);

  useEffect(() => {
    const raw = localStorage.getItem(DISMISS_KEY);
    const dismissedAt = raw ? Number(raw) : NaN;
    const shouldDismiss = !isNaN(dismissedAt) && Date.now() - dismissedAt < DISMISS_DURATION_MS;

    const storedVariant = sessionStorage.getItem(VARIANT_KEY);
    const storedIndex = storedVariant !== null ? Number(storedVariant) : NaN;
    const index = !isNaN(storedIndex) && storedIndex >= 0 && storedIndex < VARIANTS.length
      ? storedIndex
      : Math.floor(Math.random() * VARIANTS.length);
    if (storedVariant === null) sessionStorage.setItem(VARIANT_KEY, String(index));

    startTransition(() => {
      if (shouldDismiss) setDismissed(true);
      setVariantIndex(index);
    });
  }, []);

  if (dismissed) return null;

  const variant = VARIANTS[variantIndex];

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }

  function handleCta() {
    switch (variant.ctaAction) {
      case "copy":
        navigator.clipboard.writeText("https://www.thesupersuperanime.lol");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        break;
      case "discord":
        window.open("https://discord.gg/thesupersuperanime", "_blank");
        break;
      case "issues":
        window.location.href = "/issues";
        break;
      case "account":
        window.location.href = "/account";
        break;
    }
  }

  return (
    <div style={{
      background: "#111",
      border: "1px solid #2a2a2a",
      borderRadius: "8px",
      padding: "12px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "16px",
      fontSize: "13px",
      color: "#888",
    }}>
      <span>{variant.text}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        <button
          onClick={handleCta}
          style={{
            background: "transparent",
            border: "1px solid #2a2a2a",
            borderRadius: "6px",
            color: "#a3a3a3",
            fontSize: "12px",
            fontWeight: 600,
            padding: "5px 12px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "border-color 150ms, color 150ms",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.color = "#e5e5e5"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#a3a3a3"; }}
        >
          {copied ? "Copied!" : variant.cta}
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          style={{
            background: "none",
            border: "none",
            color: "#444",
            cursor: "pointer",
            fontSize: "16px",
            lineHeight: 1,
            padding: "2px 4px",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "#888")}
          onMouseLeave={e => (e.currentTarget.style.color = "#444")}
        >
          ×
        </button>
      </div>
    </div>
  );
}
