"use client";

import { useState, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Issue {
  id: string;
  type: string;
  description: string;
  animeInfo: string | null;
  status: string;
  priority: number;
  createdAt: string;
}

const ISSUE_TYPES = [
  "Video not playing",
  "Missing episode",
  "Wrong subtitles",
  "Site bug",
  "Suggestion",
  "Other",
] as const;
type IssueType = (typeof ISSUE_TYPES)[number];
type FormState = "idle" | "loading" | "success" | "error";

const ADMIN_STATUSES = [
  { value: "open",        label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "fixed",       label: "Fixed" },
  { value: "wont_fix",    label: "Won't Fix" },
  { value: "duplicate",   label: "Duplicate" },
] as const;

// ─── Status config ────────────────────────────────────────────────────────────

interface StatusStyle {
  label: string;
  color: string;
  bg: string;
  border: string;
}

const STATUS_CONFIG: Record<string, StatusStyle> = {
  open:        { label: "Open",        color: "#60a5fa", bg: "#1a2a42", border: "#2563eb44" },
  in_progress: { label: "In Progress", color: "#fbbf24", bg: "#2e1f00", border: "#f59e0b44" },
  fixed:       { label: "Fixed",       color: "#4ade80", bg: "#0e2516", border: "#22c55e44" },
  wont_fix:    { label: "Won't Fix",   color: "#f87171", bg: "#2b1111", border: "#ef444444" },
  duplicate:   { label: "Duplicate",   color: "#9ca3af", bg: "#1c1c1c", border: "#6b728044" },
  resolved:    { label: "Fixed",       color: "#4ade80", bg: "#0e2516", border: "#22c55e44" },
};

function getStatus(status: string): StatusStyle {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// ─── Submit modal ─────────────────────────────────────────────────────────────

function SubmitModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [type, setType] = useState<IssueType | "">("");
  const [description, setDescription] = useState("");
  const [animeInfo, setAnimeInfo] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!type || !description.trim()) return;
    setFormState("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, description, animeInfo: animeInfo || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Something went wrong. Try again.");
        setFormState("error");
        return;
      }
      setFormState("success");
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1600);
    } catch {
      setErrorMsg("Network error. Check your connection and try again.");
      setFormState("error");
    }
  }

  const disabled = formState === "loading" || !type || !description.trim();

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.78)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#0d0d0d", border: "1px solid #262626",
          borderRadius: "16px", padding: "32px",
          width: "100%", maxWidth: "520px",
          maxHeight: "90vh", overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
          <div>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "20px", fontWeight: 700, color: "#e5e5e5", letterSpacing: "-0.02em", marginBottom: "4px" }}>
              Submit an Issue
            </h2>
            <p style={{ color: "#555", fontSize: "13px" }}>Broken video, missing episode, or an idea? Let us know.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", color: "#555", cursor: "pointer", padding: "2px", lineHeight: 1, flexShrink: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {formState === "success" ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{
              width: "52px", height: "52px", borderRadius: "50%",
              background: "#22c55e12", border: "1px solid #22c55e30",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: "17px", fontWeight: 700, color: "#e5e5e5", marginBottom: "8px" }}>
              Submitted!
            </h3>
            <p style={{ color: "#666", fontSize: "13px" }}>Thanks for letting us know. We&apos;ll look into it.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Type */}
            <div>
              <label style={labelStyle}>
                Type <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <div style={{ position: "relative" }}>
                <select
                  value={type}
                  onChange={e => setType(e.target.value as IssueType)}
                  required
                  style={{ ...inputStyle, appearance: "none", paddingRight: "36px", cursor: "pointer", color: type ? "#e5e5e5" : "#555" }}
                >
                  <option value="" disabled>Select a category…</option>
                  {ISSUE_TYPES.map(t => (
                    <option key={t} value={t} style={{ background: "#1a1a1a", color: "#e5e5e5" }}>{t}</option>
                  ))}
                </select>
                <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#555" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Anime / episode */}
            <div>
              <label style={labelStyle}>
                Anime / episode{" "}
                <span style={{ color: "#555", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                type="text"
                value={animeInfo}
                onChange={e => setAnimeInfo(e.target.value)}
                placeholder="e.g. Bleach ep 12, One Piece S21E04…"
                maxLength={200}
                style={inputStyle}
              />
            </div>

            {/* Description */}
            <div>
              <label style={{ ...labelStyle, display: "flex", justifyContent: "space-between" }}>
                <span>Description <span style={{ color: "#ef4444" }}>*</span></span>
                <span style={{ color: description.length > 1800 ? "#eab308" : "#444", fontSize: "11px", fontWeight: 400 }}>
                  {description.length} / 2000
                </span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
                placeholder="Describe what happened and what you expected to happen…"
                maxLength={2000}
                rows={5}
                style={{ ...inputStyle, resize: "vertical", minHeight: "120px", lineHeight: "1.6" }}
              />
            </div>

            {formState === "error" && (
              <div style={{ background: "#ef444412", border: "1px solid #ef444430", borderRadius: "8px", padding: "12px 14px", color: "#f87171", fontSize: "13px" }}>
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={disabled}
              style={{
                background: disabled ? "#1e3a5f" : "#3b82f6",
                color: disabled ? "#5b9bd5" : "#fff",
                border: "none", borderRadius: "8px",
                fontSize: "14px", fontWeight: 600,
                padding: "12px 24px",
                cursor: disabled ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                transition: "background 150ms ease",
              }}
            >
              {formState === "loading" ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animation: "spin 0.7s linear infinite" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Submitting…
                </>
              ) : "Submit"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Issue card ───────────────────────────────────────────────────────────────

function IssueCard({
  issue,
  isAdmin,
  isDragging,
  isDragOver,
  onStatusChange,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  issue: Issue;
  isAdmin: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onStatusChange: (id: string, status: string) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const sc = getStatus(issue.status);

  return (
    <div
      draggable={isAdmin}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={e => { e.preventDefault(); onDrop(); }}
      onDragEnd={onDragEnd}
      style={{
        background: isDragOver ? "#141824" : "#0d0d0d",
        border: `1px solid ${isDragOver ? "#3b82f640" : "#1e1e1e"}`,
        borderRadius: "12px",
        padding: "16px 18px",
        marginBottom: "8px",
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
        transition: "background 120ms, border-color 120ms, opacity 120ms",
        opacity: isDragging ? 0.35 : 1,
        cursor: isAdmin ? "grab" : "default",
      }}
    >
      {/* Drag handle */}
      {isAdmin && (
        <div
          title="Drag to reorder"
          style={{ color: "#2e2e2e", flexShrink: 0, marginTop: "3px", cursor: "grab", userSelect: "none" }}
        >
          <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
            <circle cx="2.5" cy="2"  r="1.5" />
            <circle cx="9.5" cy="2"  r="1.5" />
            <circle cx="2.5" cy="8"  r="1.5" />
            <circle cx="9.5" cy="8"  r="1.5" />
            <circle cx="2.5" cy="14" r="1.5" />
            <circle cx="9.5" cy="14" r="1.5" />
          </svg>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Row 1: type + status + timestamp */}
        <div style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap", marginBottom: "9px" }}>
          {/* Type badge */}
          <span style={{
            fontSize: "11px", fontWeight: 500,
            padding: "2px 9px", borderRadius: "999px",
            background: "#161616", border: "1px solid #252525",
            color: "#777", letterSpacing: "0.01em", whiteSpace: "nowrap",
          }}>
            {issue.type}
          </span>

          {/* Status */}
          {isAdmin ? (
            <div style={{ position: "relative" }}>
              <select
                value={issue.status in STATUS_CONFIG ? issue.status : "open"}
                onChange={e => { e.stopPropagation(); onStatusChange(issue.id, e.target.value); }}
                onClick={e => e.stopPropagation()}
                style={{
                  fontSize: "11px", fontWeight: 600,
                  padding: "2px 22px 2px 9px",
                  borderRadius: "999px",
                  background: sc.bg, border: `1px solid ${sc.border}`,
                  color: sc.color, appearance: "none",
                  cursor: "pointer", fontFamily: "inherit",
                  letterSpacing: "0.01em",
                }}
              >
                {ADMIN_STATUSES.map(s => (
                  <option key={s.value} value={s.value} style={{ background: "#1a1a1a", color: "#e5e5e5" }}>
                    {s.label}
                  </option>
                ))}
              </select>
              <div style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: sc.color }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          ) : (
            <span style={{
              fontSize: "11px", fontWeight: 600,
              padding: "2px 9px", borderRadius: "999px",
              background: sc.bg, border: `1px solid ${sc.border}`,
              color: sc.color, whiteSpace: "nowrap",
            }}>
              {sc.label}
            </span>
          )}

          {/* Timestamp */}
          <span style={{ color: "#333", fontSize: "12px", marginLeft: "auto", whiteSpace: "nowrap", flexShrink: 0 }}>
            {formatRelativeTime(issue.createdAt)}
          </span>
        </div>

        {/* Anime info */}
        {issue.animeInfo && (
          <div style={{ fontSize: "12px", color: "#4a4a4a", marginBottom: "7px", fontStyle: "italic" }}>
            {issue.animeInfo}
          </div>
        )}

        {/* Description preview (2-line clamp) */}
        <p style={{
          fontSize: "13px", color: "#666", lineHeight: "1.65", margin: 0,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}>
          {issue.description}
        </p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchIssues();
    checkAdmin();
  }, []);

  async function fetchIssues() {
    setLoading(true);
    try {
      const res = await fetch("/api/issues");
      if (res.ok) {
        const data = await res.json();
        setIssues(data.issues);
      }
    } finally {
      setLoading(false);
    }
  }

  async function checkAdmin() {
    try {
      const res = await fetch("/api/admin/issues");
      setIsAdmin(res.ok);
    } catch {
      setIsAdmin(false);
    }
  }

  async function handleStatusChange(issueId: string, newStatus: string) {
    // Optimistic update
    setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: newStatus } : i));
    await fetch(`/api/admin/issues/${issueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  async function handleDrop(dropIndex: number) {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }

    const reordered = [...issues];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);

    // Assign priorities so that position 0 = highest priority number
    const withPriorities = reordered.map((issue, i) => ({
      ...issue,
      priority: reordered.length - 1 - i,
    }));

    // Snapshot original priorities for diff
    const originalPriority = new Map(issues.map(i => [i.id, i.priority]));

    setIssues(withPriorities);
    setDragIndex(null);
    setDragOverIndex(null);

    const changed = withPriorities.filter(i => i.priority !== originalPriority.get(i.id));
    await Promise.all(
      changed.map(issue =>
        fetch(`/api/admin/issues/${issue.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: issue.priority }),
        })
      )
    );
  }

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "8px 0 80px" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        gap: "16px", marginBottom: "32px", flexWrap: "wrap",
      }}>
        <div>
          <h1 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "28px", fontWeight: 700,
            color: "#e5e5e5", letterSpacing: "-0.02em",
            marginBottom: "6px",
          }}>
            Issues &amp; Suggestions
          </h1>
          <p style={{ color: "#555", fontSize: "13px", lineHeight: "1.6" }}>
            Community-reported bugs, missing content, and feature requests.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          style={{
            background: "#3b82f6", color: "#fff",
            border: "none", borderRadius: "8px",
            fontSize: "13px", fontWeight: 600,
            padding: "10px 16px", cursor: "pointer",
            fontFamily: "inherit", flexShrink: 0,
            display: "flex", alignItems: "center", gap: "7px",
            whiteSpace: "nowrap",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Got an issue? Submit one here
        </button>
      </div>

      {/* Meta row */}
      {!loading && issues.length > 0 && (
        <div style={{ color: "#383838", fontSize: "12px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span>{issues.length} {issues.length === 1 ? "entry" : "entries"}</span>
          {isAdmin && (
            <span style={{ color: "#2563eb", background: "#1e3a5f44", border: "1px solid #2563eb33", padding: "1px 7px", borderRadius: "999px", fontSize: "11px", fontWeight: 600 }}>
              Admin
            </span>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ color: "#3a3a3a", fontSize: "13px", padding: "64px 0", textAlign: "center" }}>
          Loading…
        </div>
      ) : issues.length === 0 ? (
        <div style={{ textAlign: "center", padding: "72px 0" }}>
          <div style={{ fontSize: "40px", marginBottom: "16px", opacity: 0.15 }}>⚑</div>
          <p style={{ color: "#555", fontSize: "14px", marginBottom: "4px" }}>No issues reported yet.</p>
          <p style={{ color: "#383838", fontSize: "13px" }}>Be the first to submit one!</p>
        </div>
      ) : (
        <div>
          {issues.map((issue, index) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              isAdmin={isAdmin}
              isDragging={dragIndex === index}
              isDragOver={dragOverIndex === index}
              onStatusChange={handleStatusChange}
              onDragStart={() => setDragIndex(index)}
              onDragOver={e => { e.preventDefault(); setDragOverIndex(index); }}
              onDrop={() => handleDrop(index)}
              onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <SubmitModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { fetchIssues(); }}
        />
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        select option { background: #1a1a1a; }
      `}</style>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#111",
  border: "1px solid #2a2a2a",
  borderRadius: "8px",
  color: "#e5e5e5",
  fontSize: "14px",
  padding: "10px 14px",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 150ms ease",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 500,
  color: "#a3a3a3",
  marginBottom: "8px",
};
