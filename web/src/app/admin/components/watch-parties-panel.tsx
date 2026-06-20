"use client";

import { useState } from "react";

interface WatchPartyRow {
  id: string;
  roomCode: string;
  animeId: number;
  episodeNum: number;
  audioType: string;
  createdAt: string;
  expiresAt: string;
  host: { discordUsername: string | null; username: string | null; email: string } | null;
}

interface WatchPartiesPanelProps {
  initialParties: WatchPartyRow[];
}

function relativeTime(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

/** Relative time for a FUTURE timestamp (e.g. "in 4h"). */
function relativeFuture(isoStr: string): string {
  const diffMs = new Date(isoStr).getTime() - Date.now();
  if (diffMs <= 0) return "expired";
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "in <1m";
  if (diffMins < 60) return `in ${diffMins}m`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `in ${diffHrs}h`;
  return `in ${Math.floor(diffHrs / 24)}d`;
}

function hostLabel(host: WatchPartyRow["host"]): string {
  return host?.discordUsername ?? host?.username ?? host?.email ?? "Anonymous (Discord)";
}

export function WatchPartiesPanel({ initialParties }: WatchPartiesPanelProps) {
  const [parties, setParties] = useState<WatchPartyRow[]>(initialParties);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const visible = q
    ? parties.filter(
        p =>
          p.roomCode.toLowerCase().includes(q) ||
          hostLabel(p.host).toLowerCase().includes(q),
      )
    : parties;

  async function deleteParty(id: string) {
    if (deleting.has(id)) return;
    setDeleting(s => new Set(s).add(id));
    try {
      const res = await fetch("/api/admin/watch-parties", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setParties(prev => prev.filter(p => p.id !== id));
      }
    } finally {
      setDeleting(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  return (
    <div>
      {/* Header + search */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h2 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "11px", fontWeight: 600, color: "#555",
            textTransform: "uppercase", letterSpacing: "0.08em", margin: 0,
          }}>
            Watch Parties
          </h2>
          {parties.length > 0 && (
            <span style={{
              background: "#3b82f618", color: "#3b82f6",
              fontSize: "11px", fontWeight: 600,
              padding: "2px 7px", borderRadius: "999px",
              border: "1px solid #3b82f630",
            }}>
              {parties.length} active
            </span>
          )}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by room code or host…"
          style={{
            background: "transparent",
            border: "1px solid #2a2a2a",
            borderRadius: "6px",
            color: "#e5e5e5",
            fontSize: "12px",
            padding: "6px 12px",
            fontFamily: "inherit",
            minWidth: "240px",
          }}
        />
      </div>

      {/* Room list */}
      <div style={{
        background: "#111", border: "1px solid #2a2a2a",
        borderRadius: "12px", overflow: "hidden",
      }}>
        {visible.length === 0 ? (
          <div style={{
            padding: "48px", textAlign: "center",
            color: "#444", fontSize: "13px",
          }}>
            {parties.length === 0 ? "No active watch parties." : "No rooms match your search."}
          </div>
        ) : (
          visible.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "12px",
                padding: "14px 16px",
                borderBottom: i < visible.length - 1 ? "1px solid #1a1a1a" : "none",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "5px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  {/* Room code → watch URL */}
                  <a
                    href={`/watch/${p.animeId}/${p.episodeNum}?party=${p.roomCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontFamily: "monospace",
                      color: "#3b82f6",
                      fontSize: "13px",
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    {p.roomCode}
                  </a>
                  {/* Audio type pill */}
                  <span style={{
                    fontSize: "10px", fontWeight: 700,
                    color: "#a3a3a3", background: "#1a1a1a",
                    border: "1px solid #2a2a2a",
                    padding: "1px 6px", borderRadius: "999px",
                    letterSpacing: "0.05em",
                  }}>
                    {p.audioType.toUpperCase()}
                  </span>
                  <span style={{ fontSize: "12px", color: "#555" }}>
                    Anime #{p.animeId} · Ep {p.episodeNum}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#444", flexWrap: "wrap" }}>
                  <span>{hostLabel(p.host)}</span>
                  <span>·</span>
                  <span>created {relativeTime(p.createdAt)}</span>
                  <span>·</span>
                  <span>expires {relativeFuture(p.expiresAt)}</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", paddingTop: "2px" }}>
                <button
                  onClick={() => deleteParty(p.id)}
                  disabled={deleting.has(p.id)}
                  style={{
                    background: "#ef444418",
                    border: "1px solid #ef444433",
                    color: "#ef4444",
                    fontSize: "12px", fontWeight: 600,
                    padding: "6px 14px", borderRadius: "6px",
                    cursor: deleting.has(p.id) ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    opacity: deleting.has(p.id) ? 0.5 : 1,
                    transition: "all 150ms ease",
                  }}
                >
                  {deleting.has(p.id) ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
