"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UserResult {
  id: string;
  username: string | null;
  displayName: string | null;
  discordUsername: string | null;
  avatarPreset: number | null;
  discordAvatar: string | null;
}

interface BadgeDef {
  slug: string;
  name: string;
  description: string;
  icon: string;
  rarity: string;
  rarityOrder: number;
  grantedBy: string;
  stackable: boolean;
}

interface UserBadgeEntry {
  slug: string;
  name: string;
  icon: string;
  rarity: string;
  context: string | null;
}

const RARITY_COLOR: Record<string, string> = {
  legendary: "#facc15",
  epic: "#a855f7",
  rare: "#3b82f6",
  common: "#a3a3a3",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0f0f0f",
  border: "1px solid #2a2a2a",
  borderRadius: "8px",
  padding: "9px 12px",
  color: "#e5e5e5",
  fontSize: "13px",
  outline: "none",
  boxSizing: "border-box",
};

const cardStyle: React.CSSProperties = {
  background: "#111",
  border: "1px solid #2a2a2a",
  borderRadius: "16px",
  padding: "20px 24px",
};

function userLabel(u: UserResult): string {
  return u.displayName || u.username || u.discordUsername || u.id;
}

export function BadgeManagementPanel({ isOwner }: { isOwner: boolean }) {
  // ── Catalogue ──────────────────────────────────────────────────────────────
  const [allBadges, setAllBadges] = useState<BadgeDef[]>([]);

  useEffect(() => {
    fetch("/api/badges/list")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => Array.isArray(data) && setAllBadges(data))
      .catch(() => {});
  }, []);

  // Badges this caller is allowed to grant manually.
  const grantable = allBadges.filter((b) =>
    isOwner ? b.grantedBy === "admin" || b.grantedBy === "owner" : b.grantedBy === "admin",
  );

  // ── Search ───────────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<UserResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up the pending debounce timer on unmount.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // Debounced search driven by the input handler (400ms).
  function scheduleSearch(raw: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = raw.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setResults(Array.isArray(data) ? data : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 400);
  }

  function onQueryChange(value: string) {
    setQuery(value);
    if (selected) setSelected(null);
    scheduleSearch(value);
  }

  // ── Selected user's badges ──────────────────────────────────────────────
  const [userBadges, setUserBadges] = useState<UserBadgeEntry[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(false);

  const loadUserBadges = useCallback((userId: string) => {
    setLoadingBadges(true);
    fetch(`/api/badges?userId=${encodeURIComponent(userId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setUserBadges(Array.isArray(data) ? data : []))
      .catch(() => setUserBadges([]))
      .finally(() => setLoadingBadges(false));
  }, []);

  function selectUser(u: UserResult) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSelected(u);
    setResults([]);
    setSearching(false);
    setQuery(userLabel(u));
    loadUserBadges(u.id);
  }

  function clearUser() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSelected(null);
    setQuery("");
    setUserBadges([]);
    setResults([]);
    setSearching(false);
    setGrantSlug("");
    setContext("");
    setStatus(null);
  }

  // ── Grant / revoke ──────────────────────────────────────────────────────
  const [grantSlug, setGrantSlug] = useState("");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const selectedBadgeDef = grantable.find((b) => b.slug === grantSlug);

  async function handleGrant() {
    if (!selected || !grantSlug) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/badges/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selected.id,
          badgeSlug: grantSlug,
          context: context.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ ok: false, msg: data?.error ?? "Grant failed" });
      } else if (data?.granted === false) {
        setStatus({ ok: false, msg: "User already has this badge" });
      } else {
        setStatus({ ok: true, msg: "Badge granted" });
        setContext("");
        loadUserBadges(selected.id);
      }
    } catch {
      setStatus({ ok: false, msg: "Network error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(badge: UserBadgeEntry) {
    if (!selected) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/badges/revoke", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selected.id,
          badgeSlug: badge.slug,
          context: badge.context ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ ok: false, msg: data?.error ?? "Revoke failed" });
      } else {
        setStatus({ ok: true, msg: "Badge revoked" });
        loadUserBadges(selected.id);
      }
    } catch {
      setStatus({ ok: false, msg: "Network error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Search */}
      <div style={{ ...cardStyle, position: "relative" }}>
        <label
          style={{
            display: "block",
            fontSize: "12px",
            color: "#666",
            marginBottom: "8px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Find user
        </label>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            value={query}
            placeholder="Username or display name…"
            onChange={(e) => onQueryChange(e.target.value)}
            style={inputStyle}
          />
          {selected && (
            <button
              onClick={clearUser}
              style={{
                background: "#1a1a1a",
                border: "1px solid #2a2a2a",
                color: "#a3a3a3",
                borderRadius: "8px",
                padding: "0 14px",
                fontSize: "13px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Results dropdown */}
        {!selected && (query.trim() || searching) && (
          <div
            style={{
              marginTop: "8px",
              border: "1px solid #2a2a2a",
              borderRadius: "8px",
              overflow: "hidden",
              background: "#0f0f0f",
            }}
          >
            {searching && results.length === 0 ? (
              <div style={{ padding: "12px", color: "#555", fontSize: "13px" }}>Searching…</div>
            ) : results.length === 0 ? (
              <div style={{ padding: "12px", color: "#555", fontSize: "13px" }}>No users found.</div>
            ) : (
              results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => selectUser(u)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    borderBottom: "1px solid #1a1a1a",
                    color: "#e5e5e5",
                    padding: "10px 12px",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#161616")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <span style={{ fontWeight: 600 }}>{userLabel(u)}</span>
                  {u.username && (
                    <span style={{ color: "#555", marginLeft: "8px" }}>@{u.username}</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Selected user management */}
      {selected && (
        <>
          {/* Current badges */}
          <div style={cardStyle}>
            <h3
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: "15px",
                fontWeight: 600,
                marginBottom: "14px",
              }}
            >
              {userLabel(selected)}&rsquo;s badges
            </h3>
            {loadingBadges ? (
              <p style={{ color: "#555", fontSize: "13px" }}>Loading…</p>
            ) : userBadges.length === 0 ? (
              <p style={{ color: "#555", fontSize: "13px" }}>No badges yet.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {userBadges.map((b) => {
                  const color = RARITY_COLOR[b.rarity] ?? RARITY_COLOR.common;
                  return (
                    <span
                      key={b.slug + (b.context ?? "")}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 10px",
                        borderRadius: "20px",
                        fontSize: "13px",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        background: "#0f0f0f",
                        border: "1px solid #2a2a2a",
                        color,
                      }}
                    >
                      {b.icon} {b.name}
                      {b.context ? <span style={{ color: "#555" }}>· {b.context}</span> : null}
                      <button
                        onClick={() => handleRevoke(b)}
                        disabled={busy}
                        title="Revoke badge"
                        style={{
                          background: "none",
                          border: "none",
                          color: "#666",
                          cursor: busy ? "not-allowed" : "pointer",
                          fontSize: "14px",
                          lineHeight: 1,
                          padding: 0,
                          marginLeft: "2px",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "#666")}
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Grant badge */}
          <div style={cardStyle}>
            <h3
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: "15px",
                fontWeight: 600,
                marginBottom: "14px",
              }}
            >
              Grant a badge
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <select
                value={grantSlug}
                onChange={(e) => setGrantSlug(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">Select a badge…</option>
                {grantable.map((b) => (
                  <option key={b.slug} value={b.slug}>
                    {b.icon} {b.name} ({b.rarity})
                  </option>
                ))}
              </select>

              {selectedBadgeDef?.stackable && (
                <input
                  type="text"
                  value={context}
                  placeholder="Context (e.g. Season 1, Week of 2026-06-17)"
                  onChange={(e) => setContext(e.target.value)}
                  style={inputStyle}
                />
              )}

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button
                  onClick={handleGrant}
                  disabled={busy || !grantSlug}
                  style={{
                    background: busy || !grantSlug ? "#1e3a8a" : "#2563eb",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "9px 20px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: busy || !grantSlug ? "not-allowed" : "pointer",
                    opacity: busy || !grantSlug ? 0.7 : 1,
                  }}
                >
                  {busy ? "Working…" : "Grant"}
                </button>
                {status && (
                  <span style={{ color: status.ok ? "#22c55e" : "#f87171", fontSize: "13px" }}>
                    {status.msg}
                  </span>
                )}
              </div>
              {grantable.length === 0 && (
                <p style={{ color: "#555", fontSize: "12px" }}>
                  No grantable badges available for your permission level.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default BadgeManagementPanel;
