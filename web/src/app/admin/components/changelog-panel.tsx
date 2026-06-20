"use client";

import { useState } from "react";

interface ChangelogRow {
  id: string;
  version: string;
  title: string;
  body: string;
  major: boolean;
  publishedAt: string;
}

interface ChangelogPanelProps {
  initialEntries: ChangelogRow[];
}

function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function ChangelogPanel({ initialEntries }: ChangelogPanelProps) {
  const [entries, setEntries] = useState<ChangelogRow[]>(initialEntries);
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [major, setMajor] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [posted, setPosted] = useState(false);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  async function publish() {
    if (!version.trim() || !title.trim() || !body.trim() || publishing) return;
    setPublishing(true);
    setPosted(false);
    try {
      const res = await fetch("/api/changelog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: version.trim(), title: title.trim(), body: body.trim(), major }),
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(prev => [data.entry, ...prev]);
        setVersion("");
        setTitle("");
        setBody("");
        setMajor(false);
        setPosted(true);
        setTimeout(() => setPosted(false), 2000);
      }
    } finally {
      setPublishing(false);
    }
  }

  async function deleteEntry(id: string) {
    if (deleting.has(id)) return;
    if (!confirm("Delete this changelog entry?")) return;
    setDeleting(s => new Set(s).add(id));
    try {
      const res = await fetch("/api/changelog", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setEntries(prev => prev.filter(e => e.id !== id));
      }
    } finally {
      setDeleting(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <h2 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "11px", fontWeight: 600, color: "#555",
          textTransform: "uppercase", letterSpacing: "0.08em", margin: 0,
        }}>
          Changelog
        </h2>
        {entries.length > 0 && (
          <span style={{
            background: "#3b82f618", color: "#3b82f6",
            fontSize: "11px", fontWeight: 600,
            padding: "2px 7px", borderRadius: "999px",
            border: "1px solid #3b82f630",
          }}>
            {entries.length} entries
          </span>
        )}
      </div>

      {/* Create form */}
      <div style={{
        background: "#111", border: "1px solid #2a2a2a",
        borderRadius: "12px", padding: "16px", marginBottom: "16px",
      }}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
          <input
            value={version}
            onChange={e => setVersion(e.target.value)}
            placeholder="1.4.0"
            style={{
              width: "120px",
              background: "#1a1a1a", border: "1px solid #2a2a2a",
              borderRadius: "6px", color: "#e5e5e5",
              fontSize: "13px", padding: "8px 10px",
              fontFamily: "inherit", outline: "none",
            }}
          />
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title"
            style={{
              flex: 1,
              background: "#1a1a1a", border: "1px solid #2a2a2a",
              borderRadius: "6px", color: "#e5e5e5",
              fontSize: "13px", padding: "8px 10px",
              fontFamily: "inherit", outline: "none",
            }}
          />
        </div>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="What changed?"
          rows={4}
          style={{
            width: "100%",
            background: "#1a1a1a", border: "1px solid #2a2a2a",
            borderRadius: "8px", color: "#e5e5e5",
            fontSize: "13px", padding: "10px 12px",
            fontFamily: "inherit", resize: "vertical",
            outline: "none", boxSizing: "border-box",
            marginBottom: "10px",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#888", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={major}
              onChange={e => setMajor(e.target.checked)}
            />
            Major release (triggers &quot;What&apos;s New&quot; modal)
          </label>
          <button
            onClick={publish}
            disabled={publishing || !version.trim() || !title.trim() || !body.trim()}
            style={{
              background: "#3b82f6", color: "#fff", border: "none",
              borderRadius: "6px", padding: "8px 18px",
              fontSize: "13px", fontWeight: 600,
              cursor: publishing ? "not-allowed" : "pointer",
              opacity: publishing || !version.trim() || !title.trim() || !body.trim() ? 0.5 : 1,
              fontFamily: "inherit",
            }}
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
          {posted && (
            <span style={{ fontSize: "12px", color: "#22c55e" }}>Posted to Discord</span>
          )}
        </div>
      </div>

      {/* Entry list */}
      <div style={{
        background: "#111", border: "1px solid #2a2a2a",
        borderRadius: "12px", overflow: "hidden",
      }}>
        {entries.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#444", fontSize: "13px" }}>
            No changelog entries yet.
          </div>
        ) : (
          entries.map((e, i) => (
            <div
              key={e.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "12px",
                padding: "14px 16px",
                borderBottom: i < entries.length - 1 ? "1px solid #1a1a1a" : "none",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "5px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{
                    fontFamily: "monospace", fontSize: "12px", fontWeight: 700,
                    color: "#3b82f6", background: "#3b82f618",
                    border: "1px solid #3b82f630", padding: "1px 7px",
                    borderRadius: "999px",
                  }}>
                    v{e.version}
                  </span>
                  {e.major && (
                    <span style={{
                      fontSize: "10px", fontWeight: 700,
                      color: "#22c55e", background: "#22c55e18",
                      border: "1px solid #22c55e30",
                      padding: "1px 6px", borderRadius: "999px",
                      letterSpacing: "0.05em",
                    }}>
                      MAJOR
                    </span>
                  )}
                  <span style={{ fontSize: "13px", color: "#e5e5e5", fontWeight: 600 }}>{e.title}</span>
                </div>
                <div style={{ fontSize: "11px", color: "#444" }}>{formatDate(e.publishedAt)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", paddingTop: "2px" }}>
                <button
                  onClick={() => deleteEntry(e.id)}
                  disabled={deleting.has(e.id)}
                  style={{
                    background: "#ef444418",
                    border: "1px solid #ef444433",
                    color: "#ef4444",
                    fontSize: "12px", fontWeight: 600,
                    padding: "6px 14px", borderRadius: "6px",
                    cursor: deleting.has(e.id) ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    opacity: deleting.has(e.id) ? 0.5 : 1,
                    transition: "all 150ms ease",
                  }}
                >
                  {deleting.has(e.id) ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
