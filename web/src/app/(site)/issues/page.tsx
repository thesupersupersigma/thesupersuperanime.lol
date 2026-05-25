"use client";

import { useState } from "react";
import Link from "next/link";

const ISSUE_TYPES = [
  "Video not playing",
  "Missing episode",
  "Wrong subtitles",
  "Site bug",
  "Other",
] as const;

type IssueType = typeof ISSUE_TYPES[number];
type FormState = "idle" | "loading" | "success" | "error";

export default function IssuesPage() {
  const [type, setType] = useState<IssueType | "">("");
  const [description, setDescription] = useState("");
  const [animeInfo, setAnimeInfo] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!type || !description.trim()) return;

    setState("loading");
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
        setState("error");
        return;
      }

      setState("success");
    } catch {
      setErrorMsg("Network error. Check your connection and try again.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div style={{ maxWidth: "560px", margin: "0 auto", padding: "48px 0" }}>
        <div style={{
          background: "#111",
          border: "1px solid #22c55e33",
          borderRadius: "16px",
          padding: "40px",
          textAlign: "center",
        }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "50%",
            background: "#22c55e18", border: "1px solid #22c55e33",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "20px", fontWeight: 700,
            color: "#e5e5e5", marginBottom: "10px", letterSpacing: "-0.02em",
          }}>
            Report submitted
          </h2>
          <p style={{ color: "#666", fontSize: "13px", marginBottom: "28px", lineHeight: "1.6" }}>
            Thanks for letting us know. We&apos;ll look into it.
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
            <button
              onClick={() => {
                setState("idle");
                setType("");
                setDescription("");
                setAnimeInfo("");
              }}
              style={{
                background: "#1a1a1a", border: "1px solid #2a2a2a",
                color: "#a3a3a3", padding: "8px 18px",
                borderRadius: "8px", fontSize: "13px", fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Submit another
            </button>
            <Link href="/" style={{
              background: "#3b82f6", color: "#fff",
              padding: "8px 18px", borderRadius: "8px",
              fontSize: "13px", fontWeight: 600,
              textDecoration: "none", display: "inline-block",
            }}>
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", padding: "8px 0 80px" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "28px", fontWeight: 700,
          color: "#e5e5e5", letterSpacing: "-0.02em",
          marginBottom: "8px",
        }}>
          Report an issue
        </h1>
        <p style={{ color: "#555", fontSize: "13px", lineHeight: "1.6" }}>
          Broken video? Missing episode? Something not working right? Let us know.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Issue type */}
        <div>
          <label style={labelStyle}>Issue type <span style={{ color: "#ef4444" }}>*</span></label>
          <div style={{ position: "relative" }}>
            <select
              value={type}
              onChange={e => setType(e.target.value as IssueType)}
              required
              style={{
                ...inputStyle,
                appearance: "none",
                paddingRight: "36px",
                cursor: "pointer",
                color: type ? "#e5e5e5" : "#555",
              }}
            >
              <option value="" disabled>Select a category…</option>
              {ISSUE_TYPES.map(t => (
                <option key={t} value={t} style={{ background: "#1a1a1a", color: "#e5e5e5" }}>
                  {t}
                </option>
              ))}
            </select>
            {/* Custom chevron */}
            <div style={{
              position: "absolute", right: "12px", top: "50%",
              transform: "translateY(-50%)", pointerEvents: "none",
              color: "#555",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </div>

        {/* Anime / episode */}
        <div>
          <label style={labelStyle}>
            Anime / episode
            <span style={{ color: "#555", fontWeight: 400, marginLeft: "6px" }}>(optional)</span>
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

        {/* Error */}
        {state === "error" && (
          <div style={{
            background: "#ef444418", border: "1px solid #ef444433",
            borderRadius: "8px", padding: "12px 14px",
            color: "#ef4444", fontSize: "13px",
          }}>
            {errorMsg}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={state === "loading" || !type || !description.trim()}
          style={{
            background: state === "loading" || !type || !description.trim() ? "#1e3a5f" : "#3b82f6",
            color: state === "loading" || !type || !description.trim() ? "#5b9bd5" : "#fff",
            border: "none", borderRadius: "8px",
            fontSize: "14px", fontWeight: 600,
            padding: "12px 24px",
            cursor: state === "loading" || !type || !description.trim() ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            transition: "background 150ms ease",
          }}
        >
          {state === "loading" ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                style={{ animation: "spin 0.7s linear infinite" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Submitting…
            </>
          ) : "Submit report"}
        </button>
      </form>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        select option { background: #1a1a1a; }
      `}</style>
    </div>
  );
}

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
