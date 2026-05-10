"use client";

import { useState } from "react";

interface StatusCardProps {
  providerId: string;
  displayName: string;
  status: string;
  latencyMs: number | null;
  lastSuccessAt: string | null;
  consecutiveFails: number;
  lastCheckedAt: string | null;
  /** Whether a global "Run All" is in progress */
  isGlobalRunning?: boolean;
  /** Called with updated values after a single-provider check completes */
  onUpdate?: (update: {
    providerId: string;
    status: string;
    latencyMs: number | null;
    consecutiveFails: number;
    lastCheckedAt: string;
    lastSuccessAt: string | null;
  }) => void;
}

const STATUS_COLORS: Record<string, string> = {
  healthy: "#22c55e",
  degraded: "#eab308",
  broken: "#ef4444",
  unknown: "#888888",
};

const STATUS_LABELS: Record<string, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  broken: "Broken",
  unknown: "Unknown",
};

function relativeTime(isoStr: string | null): string {
  if (!isoStr) return "never";
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

export function StatusCard({
  providerId,
  displayName,
  status,
  latencyMs,
  lastSuccessAt,
  consecutiveFails,
  lastCheckedAt,
  isGlobalRunning = false,
  onUpdate,
}: StatusCardProps) {
  const [checking, setChecking] = useState(false);

  const color = STATUS_COLORS[status] ?? STATUS_COLORS.unknown;
  const label = STATUS_LABELS[status] ?? "Unknown";
  const isPulsing = checking || isGlobalRunning;

  async function handleTest() {
    setChecking(true);
    try {
      const res = await fetch(`/api/admin/check/${providerId}`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        const r = data.result;
        onUpdate?.({
          providerId,
          status: r.status,
          latencyMs: r.latencyMs,
          consecutiveFails: r.consecutiveFails,
          lastCheckedAt: new Date().toISOString(),
          lastSuccessAt: r.success ? new Date().toISOString() : lastSuccessAt,
        });
      }
    } catch {
      // silently fail
    } finally {
      setChecking(false);
    }
  }

  return (
    <div
      style={{
        background: "#1a1a1a",
        border: `1px solid ${isPulsing ? color : "#2a2a2a"}`,
        borderRadius: "4px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        transition: "border-color 300ms ease",
        animation: isPulsing ? "pulse-opacity 1.2s ease-in-out infinite" : "none",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 600,
            fontSize: "14px",
            color: "#e5e5e5",
          }}
        >
          {displayName}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: color,
              display: "inline-block",
              boxShadow: `0 0 6px ${color}88`,
            }}
          />
          <span
            style={{ fontSize: "12px", fontWeight: 600, color }}
          >
            {label}
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <MetaRow label="Latency">
          {latencyMs != null ? `${latencyMs}ms` : "—"}
        </MetaRow>
        <MetaRow label="Last success">{relativeTime(lastSuccessAt)}</MetaRow>
        <MetaRow label="Last checked">{relativeTime(lastCheckedAt)}</MetaRow>
        {consecutiveFails > 0 && (
          <MetaRow label="Consecutive fails">
            <span style={{ color: "#ef4444", fontWeight: 600 }}>
              {consecutiveFails}
            </span>
          </MetaRow>
        )}
      </div>

      {/* Test button */}
      <button
        onClick={handleTest}
        disabled={checking || isGlobalRunning}
        style={{
          alignSelf: "flex-start",
          background: "transparent",
          border: "1px solid #2a2a2a",
          borderRadius: "4px",
          color: checking || isGlobalRunning ? "#444" : "#888",
          fontSize: "12px",
          fontWeight: 500,
          padding: "4px 10px",
          cursor: checking || isGlobalRunning ? "not-allowed" : "pointer",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          transition: "border-color 150ms ease, color 150ms ease",
        }}
        onMouseEnter={(e) => {
          if (!checking && !isGlobalRunning) {
            e.currentTarget.style.borderColor = "#3b82f6";
            e.currentTarget.style.color = "#3b82f6";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "#2a2a2a";
          e.currentTarget.style.color =
            checking || isGlobalRunning ? "#444" : "#888";
        }}
      >
        {checking ? (
          <>
            <Spinner />
            Testing…
          </>
        ) : (
          "Test"
        )}
      </button>
    </div>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "12px",
      }}
    >
      <span style={{ color: "#555" }}>{label}</span>
      <span style={{ color: "#888" }}>{children}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width="10"
      height="10"
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
