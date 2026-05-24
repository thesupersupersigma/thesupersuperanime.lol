"use client";

import { useState, useEffect } from "react";

const STATUSES = ["Planning", "Watching", "Completed", "Paused", "Dropped"] as const;
type Status = typeof STATUSES[number];

export function WatchlistButton({ animeId, title }: { animeId: number; title: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/watchlist")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const entry = data?.entries?.find((e: { animeId: number; status: string }) => e.animeId === animeId);
        setStatus(entry?.status ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [animeId]);

  async function handleAdd(newStatus: Status) {
    setLoading(true);
    setOpen(false);
    if (status === null) {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId }),
      });
    }
    await fetch("/api/watchlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ animeId, status: newStatus }),
    });
    setStatus(newStatus);
    setLoading(false);
  }

  async function handleRemove() {
    setLoading(true);
    setOpen(false);
    await fetch("/api/watchlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ animeId }),
    });
    setStatus(null);
    setLoading(false);
  }

  const STATUS_COLORS: Record<Status, string> = {
    Watching: "#3b82f6",
    Completed: "#22c55e",
    Planning: "#a855f7",
    Paused: "#f59e0b",
    Dropped: "#ef4444",
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        style={{
          background: status ? STATUS_COLORS[status] + "22" : "#1a1a1a",
          border: `1px solid ${status ? STATUS_COLORS[status] + "66" : "#2a2a2a"}`,
          color: status ? STATUS_COLORS[status] : "#a3a3a3",
          padding: "8px 16px",
          borderRadius: "8px",
          fontSize: "13px",
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "..." : status ? `✓ ${status}` : "+ Add to List"}
        {!loading && <span style={{ fontSize: "10px", opacity: 0.7 }}>▾</span>}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 10 }}
          />
          <div style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 20,
            background: "#111",
            border: "1px solid #2a2a2a",
            borderRadius: "10px",
            overflow: "hidden",
            minWidth: "160px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}>
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => handleAdd(s)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  background: status === s ? "#1a1a1a" : "none",
                  border: "none",
                  color: status === s ? STATUS_COLORS[s] : "#a3a3a3",
                  fontSize: "13px",
                  fontWeight: status === s ? 600 : 400,
                  cursor: "pointer",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#1a1a1a")}
                onMouseLeave={e => (e.currentTarget.style.background = status === s ? "#1a1a1a" : "none")}
              >
                {s}
              </button>
            ))}
            {status && (
              <>
                <div style={{ height: "1px", background: "#1a1a1a" }} />
                <button
                  onClick={handleRemove}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "10px 14px", background: "none", border: "none",
                    color: "#ef4444", fontSize: "13px", cursor: "pointer",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#1a1a1a")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  Remove from list
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}