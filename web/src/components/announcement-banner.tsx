"use client";

import { useEffect, useState, useRef } from "react";

interface Announcement {
  id: string;
  message: string;
  type: string;
}

const TYPE_COLORS: Record<string, { bg: string; border: string; icon: string }> = {
  info:    { bg: "#1e3a5f", border: "#3b82f6", icon: "ℹ️" },
  warning: { bg: "#3d2800", border: "#f59e0b", icon: "⚠️" },
  success: { bg: "#1a3a1a", border: "#22c55e", icon: "✅" },
  error:   { bg: "#3a1a1a", border: "#ef4444", icon: "🚨" },
};

export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [visible, setVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dismissedRef = useRef<Set<string>>(new Set());

  // Track fullscreen state
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // SSE connection
  useEffect(() => {
    const es = new EventSource("/api/announcement/stream");

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const a: Announcement | null = data.announcement;
        setAnnouncement(a);
        if (a && !dismissedRef.current.has(a.id)) {
          const key = `announcement-dismissed-${a.id}`;
          if (!sessionStorage.getItem(key)) {
            setVisible(true);
          }
        } else if (!a) {
          setVisible(false);
        }
      } catch {}
    };

    es.onerror = () => {
      // SSE connection dropped — reconnect automatically (browser does this)
    };

    return () => es.close();
  }, []);

  const dismiss = () => {
    if (announcement) {
      sessionStorage.setItem(`announcement-dismissed-${announcement.id}`, "1");
      dismissedRef.current.add(announcement.id);
    }
    setVisible(false);
  };

  if (!visible || !announcement || isFullscreen) return null;

  const colors = TYPE_COLORS[announcement.type] ?? TYPE_COLORS.info;

  return (
    <div
      style={{
        position: "fixed",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        width: "min(560px, calc(100vw - 32px))",
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: "12px",
        padding: "12px 16px",
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        animation: "slideDown 0.3s ease-out",
      }}
    >
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
      <span style={{ fontSize: "18px", flexShrink: 0, marginTop: "1px" }}>{colors.icon}</span>
      <p style={{
        flex: 1,
        margin: 0,
        fontSize: "14px",
        lineHeight: 1.5,
        color: "#e5e5e5",
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {announcement.message}
      </p>
      <button
        onClick={dismiss}
        style={{
          background: "none",
          border: "none",
          color: "#888",
          fontSize: "18px",
          cursor: "pointer",
          padding: "0 0 0 4px",
          lineHeight: 1,
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
