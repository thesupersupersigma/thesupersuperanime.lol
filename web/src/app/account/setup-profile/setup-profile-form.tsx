"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { completeProfileSetupAction } from "@/app/account/actions";

// ── Avatar grid ───────────────────────────────────────────────────────────────

function AvatarPicker({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (n: number) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "8px" }}>
      {Array.from({ length: 14 }, (_, i) => i + 1).map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onSelect(n)}
          title={`Avatar ${n}`}
          style={{
            padding: 0,
            background: "none",
            border: `2px solid ${selected === n ? "#3b82f6" : "transparent"}`,
            borderRadius: "50%",
            cursor: "pointer",
            transition: "border-color 0.15s",
            overflow: "hidden",
            width: 44,
            height: 44,
            flexShrink: 0,
          }}
          onMouseEnter={e => {
            if (selected !== n) e.currentTarget.style.borderColor = "#2a2a2a";
          }}
          onMouseLeave={e => {
            if (selected !== n) e.currentTarget.style.borderColor = "transparent";
          }}
        >
          <Image
            src={`/avatars/PP_${n}.png`}
            alt={`Avatar ${n}`}
            width={44}
            height={44}
            style={{ borderRadius: "50%", display: "block", objectFit: "cover" }}
          />
        </button>
      ))}
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export default function SetupProfileForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarPreset, setAvatarPreset] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const fd = new FormData(formRef.current!);
    fd.set("avatarPreset", String(avatarPreset));

    const result = await completeProfileSetupAction(fd);
    setSubmitting(false);

    if ("success" in result && result.success) {
      router.replace("/");
    } else {
      setError(
        "error" in result
          ? (result.error ?? "Something went wrong.")
          : "Something went wrong.",
      );
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#e5e5e5",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: "480px",
          width: "100%",
          background: "#111",
          border: "1px solid #2a2a2a",
          borderRadius: "16px",
          padding: "40px 36px",
        }}
      >
        {/* Header */}
        <h1
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "22px",
            fontWeight: 700,
            color: "#e5e5e5",
            marginBottom: "8px",
            letterSpacing: "-0.02em",
          }}
        >
          Set up your profile
        </h1>
        <p style={{ color: "#666", fontSize: "14px", lineHeight: "1.6", marginBottom: "32px" }}>
          Pick an avatar and choose a username before you start watching.
        </p>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "24px" }}
        >
          {/* ── Avatar picker ─────────────────────────────────────────────── */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                color: "#666",
                marginBottom: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Avatar <span style={{ color: "#f87171" }}>*</span>
            </label>
            <AvatarPicker selected={avatarPreset} onSelect={setAvatarPreset} />
            {/* hidden input so the value is in FormData even if JS hydration hasn't run */}
            <input type="hidden" name="avatarPreset" value={avatarPreset} />
          </div>

          {/* ── Username ──────────────────────────────────────────────────── */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                color: "#666",
                marginBottom: "6px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Username <span style={{ color: "#f87171" }}>*</span>
            </label>
            <input
              type="text"
              name="username"
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. animefan99"
              maxLength={20}
              autoComplete="username"
              style={{
                width: "100%",
                background: "#0f0f0f",
                border: "1px solid #2a2a2a",
                borderRadius: "8px",
                padding: "9px 12px",
                color: "#e5e5e5",
                fontSize: "13px",
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={e => (e.target.style.borderColor = "#3b82f6")}
              onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
            />
            <p style={{ color: "#444", fontSize: "11px", marginTop: "4px" }}>
              3–20 characters, letters / numbers / underscores only. Used in your public profile URL.
            </p>
          </div>

          {/* ── Display name ──────────────────────────────────────────────── */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                color: "#666",
                marginBottom: "6px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Display Name
            </label>
            <input
              type="text"
              name="displayName"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Shown on comments and the leaderboard"
              maxLength={50}
              style={{
                width: "100%",
                background: "#0f0f0f",
                border: "1px solid #2a2a2a",
                borderRadius: "8px",
                padding: "9px 12px",
                color: "#e5e5e5",
                fontSize: "13px",
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={e => (e.target.style.borderColor = "#3b82f6")}
              onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
            />
            <p style={{ color: "#444", fontSize: "11px", marginTop: "4px" }}>
              Leave blank to use your username as your display name.
            </p>
          </div>

          {/* ── Inline error ──────────────────────────────────────────────── */}
          {error && (
            <p style={{ color: "#f87171", fontSize: "13px", margin: 0 }}>{error}</p>
          )}

          {/* ── Submit ────────────────────────────────────────────────────── */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              background: submitting ? "#1e3a8a" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "12px 24px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
              transition: "background 0.15s",
            }}
          >
            {submitting ? "Saving…" : "Continue to the site →"}
          </button>
        </form>
      </div>
    </div>
  );
}
