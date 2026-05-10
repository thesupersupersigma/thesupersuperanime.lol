"use client";

import { useEffect, useState, useCallback } from "react";

interface LogEntry {
  id: string;
  providerId: string;
  level: string;
  message: string;
  latencyMs: number | null;
  createdAt: string;
}

const LEVEL_COLORS: Record<string, string> = {
  success: "#22c55e",
  info: "#888",
  warn: "#eab308",
  error: "#ef4444",
};

function relativeTime(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  return `${diffHrs}h ago`;
}

export function LogFeed() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
        setLastRefresh(new Date());
      }
    } catch {
      // silently fail — stale logs are better than a crash
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + auto-refresh every 30 seconds
  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 30_000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  return (
    <div>
      {/* Feed header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
        }}
      >
        <h2
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "13px",
            fontWeight: 600,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Live Log Feed
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {lastRefresh && (
            <span style={{ fontSize: "11px", color: "#444" }}>
              {relativeTime(lastRefresh.toISOString())}
            </span>
          )}
          <button
            onClick={fetchLogs}
            style={{
              background: "transparent",
              border: "1px solid #2a2a2a",
              borderRadius: "4px",
              color: "#555",
              fontSize: "11px",
              padding: "3px 8px",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "border-color 150ms ease, color 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#3b82f6";
              e.currentTarget.style.color = "#3b82f6";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#2a2a2a";
              e.currentTarget.style.color = "#555";
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Log panel */}
      <div
        style={{
          background: "#111",
          border: "1px solid #1f1f1f",
          borderRadius: "4px",
          maxHeight: "400px",
          overflowY: "auto",
          fontFamily: "'DM Mono', 'Fira Code', 'Menlo', monospace",
          fontSize: "12px",
        }}
      >
        {loading && (
          <div
            style={{
              padding: "20px",
              textAlign: "center",
              color: "#444",
            }}
          >
            Loading…
          </div>
        )}

        {!loading && logs.length === 0 && (
          <div
            style={{
              padding: "20px",
              textAlign: "center",
              color: "#444",
            }}
          >
            No logs yet. Run a health check to generate entries.
          </div>
        )}

        {logs.map((log, i) => {
          const levelColor = LEVEL_COLORS[log.level] ?? "#888";
          const isLast = i === logs.length - 1;

          return (
            <div
              key={log.id}
              style={{
                display: "grid",
                gridTemplateColumns: "52px 80px 60px 1fr",
                alignItems: "center",
                gap: "12px",
                padding: "7px 12px",
                borderBottom: isLast ? "none" : "1px solid #1a1a1a",
                background: i % 2 === 0 ? "transparent" : "#0d0d0d",
              }}
            >
              {/* Relative time */}
              <span style={{ color: "#444", whiteSpace: "nowrap" }}>
                {relativeTime(log.createdAt)}
              </span>

              {/* Provider ID */}
              <span
                style={{
                  color: "#555",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {log.providerId}
              </span>

              {/* Level badge */}
              <span
                style={{
                  color: levelColor,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  fontSize: "10px",
                  letterSpacing: "0.04em",
                }}
              >
                {log.level}
              </span>

              {/* Message */}
              <span
                style={{
                  color: "#777",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {log.message}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
