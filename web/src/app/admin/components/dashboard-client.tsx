"use client";

import { useState, useCallback, useEffect } from "react";
import { StatusCard } from "./status-card";
import { LogFeed } from "./log-feed";

interface ProviderState {
  providerId: string;
  displayName: string;
  status: string;
  latencyMs: number | null;
  lastSuccessAt: string | null;
  consecutiveFails: number;
  lastCheckedAt: string | null;
}

interface DashboardClientProps {
  initialProviders: ProviderState[];
  initialLastChecked: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  healthy: "#22c55e",
  degraded: "#eab308",
  broken: "#ef4444",
  unknown: "#888888",
};

function relativeTime(isoStr: string | null): string {
  if (!isoStr) return "never";
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs === 1 ? "" : "s"} ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

export function DashboardClient({
  initialProviders,
  initialLastChecked,
}: DashboardClientProps) {
  const [providers, setProviders] = useState<ProviderState[]>(initialProviders);
  const [lastChecked, setLastChecked] = useState<string | null>(initialLastChecked);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  // Tick every minute to update relative timestamps
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  /** Run all checks and update all card states in one go */
  const handleRunAll = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    try {
      const res = await fetch("/api/admin/check", { method: "POST" });
      if (!res.ok) {
        setRunError("Check failed — see server logs");
        return;
      }
      // Fetch fresh statuses from DB (guaranteed consistent after the check)
      const statusRes = await fetch("/api/admin/status");
      if (statusRes.ok) {
        const data = await statusRes.json();
        const rows: ProviderState[] = data.statuses ?? [];
        setProviders((prev) =>
          prev.map((p) => {
            const updated = rows.find((r) => r.providerId === p.providerId);
            return updated ? { ...p, ...updated } : p;
          })
        );
      }
      setLastChecked(new Date().toISOString());
    } catch {
      setRunError("Network error");
    } finally {
      setRunning(false);
    }
  }, []);

  /** Called by a single StatusCard when its "Test" button completes */
  const handleCardUpdate = useCallback(
    (update: Partial<ProviderState> & { providerId: string }) => {
      setProviders((prev) =>
        prev.map((p) =>
          p.providerId === update.providerId ? { ...p, ...update } : p
        )
      );
      setLastChecked(new Date().toISOString());
    },
    []
  );

  // Summary counts
  const healthy = providers.filter((p) => p.status === "healthy").length;
  const degraded = providers.filter((p) => p.status === "degraded").length;
  const broken = providers.filter((p) => p.status === "broken").length;
  const unknown = providers.filter((p) => p.status === "unknown").length;

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(15, 15, 15, 0.95)",
          borderBottom: "1px solid #1f1f1f",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            height: "52px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Left: label + status pills */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: "13px",
                fontWeight: 700,
                color: "#666",
                textTransform: "lowercase",
                letterSpacing: "0.04em",
              }}
            >
              dashboard
            </span>
            <div style={{ display: "flex", gap: "5px" }}>
              {healthy > 0 && <Pill count={healthy} color="#22c55e" label="healthy" />}
              {degraded > 0 && <Pill count={degraded} color="#eab308" label="degraded" />}
              {broken > 0 && <Pill count={broken} color="#ef4444" label="broken" />}
              {unknown > 0 && <Pill count={unknown} color="#555" label="unknown" />}
            </div>
          </div>

          {/* Right: last checked + run button */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "12px", color: "#444" }}>
              {lastChecked
                ? `Last checked: ${relativeTime(lastChecked)}`
                : "Never checked"}
            </span>
            {runError && (
              <span style={{ fontSize: "12px", color: "#ef4444" }}>{runError}</span>
            )}
            <button
              onClick={handleRunAll}
              disabled={running}
              style={{
                background: running ? "#1e3a5f" : "#3b82f6",
                color: running ? "#5b9bd5" : "#fff",
                border: "none",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                padding: "7px 14px",
                cursor: running ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                gap: "7px",
                transition: "background 150ms ease",
              }}
            >
              {running ? (
                <>
                  <Spinner />
                  Running…
                </>
              ) : (
                "Run All Checks"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "28px 24px 80px",
          display: "flex",
          flexDirection: "column",
          gap: "32px",
        }}
      >
        {/* Provider Status Grid */}
        <section>
          <SectionLabel>Provider Status</SectionLabel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "12px",
            }}
          >
            {providers.map((p) => (
              <StatusCard
                key={p.providerId}
                {...p}
                isGlobalRunning={running}
                onUpdate={handleCardUpdate}
              />
            ))}
          </div>
        </section>

        {/* Live Log Feed */}
        <section>
          <LogFeed />
        </section>
      </div>

      {/* Global keyframes */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse-opacity {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Pill({ count, color, label }: { count: number; color: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        background: `${color}18`,
        color,
        fontSize: "11px",
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: "999px",
        border: `1px solid ${color}30`,
      }}
    >
      <span
        style={{
          width: "5px",
          height: "5px",
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
      {count} {label}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: "'Syne', sans-serif",
        fontSize: "11px",
        fontWeight: 600,
        color: "#555",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: "12px",
      }}
    >
      {children}
    </h2>
  );
}

function Spinner() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      style={{ animation: "spin 0.7s linear infinite" }}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export type { ProviderState };
