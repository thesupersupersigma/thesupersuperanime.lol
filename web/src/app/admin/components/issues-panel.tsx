"use client";

import { useState } from "react";

interface IssueRow {
  id: string;
  type: string;
  description: string;
  animeInfo: string | null;
  status: string;
  createdAt: string;
  user: { discordUsername: string | null; email: string } | null;
}

interface IssuesPanelProps {
  initialIssues: IssueRow[];
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

const TYPE_COLOR: Record<string, string> = {
  "Video not playing": "#ef4444",
  "Missing episode": "#f97316",
  "Wrong subtitles": "#eab308",
  "Site bug": "#a855f7",
  "Suggestion": "#22c55e",
  "Other": "#888",
};

export function IssuesPanel({ initialIssues }: IssuesPanelProps) {
  const [issues, setIssues] = useState<IssueRow[]>(initialIssues);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [resolving, setResolving] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = filter === "all" ? issues : issues.filter(i => i.status === filter);
  const openCount = issues.filter(i => i.status === "open").length;

  async function toggleStatus(issue: IssueRow) {
    const next = issue.status === "open" ? "resolved" : "open";
    setResolving(s => new Set(s).add(issue.id));

    try {
      const res = await fetch(`/api/admin/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, status: next } : i));
      }
    } finally {
      setResolving(s => { const n = new Set(s); n.delete(issue.id); return n; });
    }
  }

  return (
    <div>
      {/* Header + filters */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h2 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "11px", fontWeight: 600, color: "#555",
            textTransform: "uppercase", letterSpacing: "0.08em", margin: 0,
          }}>
            Issues &amp; Suggestions
          </h2>
          {openCount > 0 && (
            <span style={{
              background: "#ef444418", color: "#ef4444",
              fontSize: "11px", fontWeight: 600,
              padding: "2px 7px", borderRadius: "999px",
              border: "1px solid #ef444430",
            }}>
              {openCount} open
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {(["open", "resolved", "all"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? "#1a1a1a" : "transparent",
              border: filter === f ? "1px solid #2a2a2a" : "1px solid transparent",
              color: filter === f ? "#e5e5e5" : "#555",
              fontSize: "12px", fontWeight: 500,
              padding: "4px 10px", borderRadius: "6px",
              cursor: "pointer", fontFamily: "inherit",
              transition: "all 150ms ease",
            }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Issue list */}
      <div style={{
        background: "#111", border: "1px solid #2a2a2a",
        borderRadius: "12px", overflow: "hidden",
      }}>
        {visible.length === 0 ? (
          <div style={{
            padding: "48px", textAlign: "center",
            color: "#444", fontSize: "13px",
          }}>
            {filter === "open" ? "No open issues 🎉" : `No ${filter} issues`}
          </div>
        ) : (
          visible.map((issue, i) => (
            <div key={issue.id}>
              {/* Row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "12px",
                  padding: "14px 16px",
                  borderBottom: i < visible.length - 1 ? "1px solid #1a1a1a" : "none",
                  cursor: "pointer",
                  transition: "background 120ms ease",
                }}
                onClick={() => setExpanded(expanded === issue.id ? null : issue.id)}
                onMouseEnter={e => (e.currentTarget.style.background = "#161616")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "5px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    {/* Type badge */}
                    <span style={{
                      fontSize: "11px", fontWeight: 600,
                      color: TYPE_COLOR[issue.type] ?? "#888",
                      background: `${TYPE_COLOR[issue.type] ?? "#888"}18`,
                      border: `1px solid ${TYPE_COLOR[issue.type] ?? "#888"}30`,
                      padding: "2px 7px", borderRadius: "999px",
                      whiteSpace: "nowrap",
                    }}>
                      {issue.type}
                    </span>
                    {issue.animeInfo && (
                      <span style={{
                        fontSize: "12px", color: "#555",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {issue.animeInfo}
                      </span>
                    )}
                  </div>
                  <p style={{
                    fontSize: "13px", color: "#a3a3a3",
                    margin: 0, lineHeight: "1.5",
                    overflow: "hidden", textOverflow: "ellipsis",
                    display: "-webkit-box", WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}>
                    {issue.description}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#444" }}>
                    <span>{relativeTime(issue.createdAt)}</span>
                    {issue.user && (
                      <>
                        <span>·</span>
                        <span>{issue.user.discordUsername ?? issue.user.email}</span>
                      </>
                    )}
                    {!issue.user && <span>· anonymous</span>}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", paddingTop: "2px" }}>
                  {/* Status badge */}
                  <span style={{
                    fontSize: "11px", fontWeight: 600,
                    color: issue.status === "open" ? "#eab308" : "#22c55e",
                    background: issue.status === "open" ? "#eab30818" : "#22c55e18",
                    border: `1px solid ${issue.status === "open" ? "#eab30830" : "#22c55e30"}`,
                    padding: "2px 7px", borderRadius: "999px",
                    whiteSpace: "nowrap",
                  }}>
                    {issue.status}
                  </span>
                </div>
              </div>

              {/* Expanded detail */}
              {expanded === issue.id && (
                <div style={{
                  padding: "16px 16px 18px",
                  background: "#0d0d0d",
                  borderBottom: i < visible.length - 1 ? "1px solid #1a1a1a" : "none",
                }}>
                  <p style={{
                    fontSize: "13px", color: "#a3a3a3",
                    margin: "0 0 16px", lineHeight: "1.7",
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {issue.description}
                  </p>
                  <button
                    onClick={() => toggleStatus(issue)}
                    disabled={resolving.has(issue.id)}
                    style={{
                      background: issue.status === "open" ? "#22c55e18" : "#1a1a1a",
                      border: `1px solid ${issue.status === "open" ? "#22c55e33" : "#2a2a2a"}`,
                      color: issue.status === "open" ? "#22c55e" : "#888",
                      fontSize: "12px", fontWeight: 600,
                      padding: "6px 14px", borderRadius: "6px",
                      cursor: resolving.has(issue.id) ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                      opacity: resolving.has(issue.id) ? 0.5 : 1,
                      transition: "all 150ms ease",
                    }}
                  >
                    {resolving.has(issue.id)
                      ? "Updating…"
                      : issue.status === "open"
                      ? "✓ Mark resolved"
                      : "↩ Reopen"}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
