"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "lastSeenChangelog";

interface ChangelogEntry {
  id: string;
  version: string;
  title: string;
  body: string;
  major: boolean;
  publishedAt: string;
}

export function WhatsNewModal() {
  const [entry, setEntry] = useState<ChangelogEntry | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/changelog")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.entries) return;
        const latestMajor = (data.entries as ChangelogEntry[]).find((e) => e.major === true);
        if (!latestMajor) return;

        const lastSeen = localStorage.getItem(SEEN_KEY);
        if (lastSeen === latestMajor.id) return;

        setEntry(latestMajor);
        setTimeout(() => {
          if (!cancelled) setVisible(true);
        }, 1500);
      })
      .catch((err) => console.error("[whats-new] fetch error:", err));

    return () => { cancelled = true; };
  }, []);

  function handleDismiss() {
    if (entry) localStorage.setItem(SEEN_KEY, entry.id);
    setVisible(false);
  }

  if (!visible || !entry) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 9998,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="animate-scale-in"
        style={{
          background: "#111",
          border: "1px solid #2a2a2a",
          borderRadius: "16px",
          padding: "32px",
          maxWidth: "480px",
          width: "calc(100% - 48px)",
        }}
      >
        <span style={{ fontSize: "12px", fontWeight: 700, color: "#3b82f6", letterSpacing: "0.04em" }}>
          ✨ WHAT&apos;S NEW
        </span>
        <h2
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "20px",
            fontWeight: 700,
            color: "#e5e5e5",
            margin: "10px 0 14px",
          }}
        >
          v{entry.version} — {entry.title}
        </h2>
        <p
          style={{
            fontSize: "13px",
            color: "#aaa",
            lineHeight: "1.7",
            whiteSpace: "pre-wrap",
            margin: "0 0 24px",
          }}
        >
          {entry.body}
        </p>
        <button
          onClick={handleDismiss}
          style={{
            width: "100%",
            background: "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            padding: "10px 0",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
