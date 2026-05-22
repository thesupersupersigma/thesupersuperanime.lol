"use client";

import { useState, useEffect } from "react";

interface Props {
  episode: number;
  airingAt: number; // Unix timestamp in seconds
  compact?: boolean; // compact = small inline version for watch page
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number; // ms remaining
}

function getTimeLeft(airingAt: number): TimeLeft {
  const total = airingAt * 1000 - Date.now();
  if (total <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };

  const days = Math.floor(total / (1000 * 60 * 60 * 24));
  const hours = Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((total % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, total };
}

export function NextEpisodeCountdown({ episode, airingAt, compact = false }: Props) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(getTimeLeft(airingAt));

  useEffect(() => {
    // Update immediately, then every second
    setTimeLeft(getTimeLeft(airingAt));
    const interval = setInterval(() => {
      const t = getTimeLeft(airingAt);
      setTimeLeft(t);
      if (t.total <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [airingAt]);

  if (timeLeft.total <= 0) {
    // Episode has aired — prompt a refresh
    return compact ? (
      <span style={{ color: "#22c55e", fontSize: "12px", fontWeight: 600 }}>
        Ep {episode} is out — refresh!
      </span>
    ) : (
      <div style={{
        display: "inline-flex", alignItems: "center", gap: "8px",
        background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
        borderRadius: "8px", padding: "10px 16px",
      }}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px rgba(34,197,94,0.8)" }} />
        <span style={{ color: "#22c55e", fontSize: "13px", fontWeight: 600 }}>
          Episode {episode} just aired — refresh to watch!
        </span>
      </div>
    );
  }

  if (compact) {
    // Inline version for watch page — single line
    return (
      <div style={{
        display: "inline-flex", alignItems: "center", gap: "8px",
        color: "#888", fontSize: "12px",
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>
          Ep {episode} in{" "}
          <span style={{ color: "#e5e5e5", fontWeight: 600 }}>
            {timeLeft.days > 0 && `${timeLeft.days}d `}
            {String(timeLeft.hours).padStart(2, "0")}:
            {String(timeLeft.minutes).padStart(2, "0")}:
            {String(timeLeft.seconds).padStart(2, "0")}
          </span>
        </span>
      </div>
    );
  }

  // Full version for anime detail page
  return (
    <div style={{
      background: "#111",
      border: "1px solid #2a2a2a",
      borderRadius: "12px",
      padding: "16px 20px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Blue accent line */}
      <div style={{
        position: "absolute", top: 0, left: 0, width: "100%", height: "1px",
        background: "linear-gradient(to right, transparent, rgba(59,130,246,0.5), transparent)",
      }} />

      <div style={{
        display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px",
      }}>
        <div style={{
          width: "6px", height: "6px", borderRadius: "50%",
          background: "#3b82f6", boxShadow: "0 0 8px rgba(59,130,246,0.8)",
          animation: "pulse 2s infinite",
        }} />
        <span style={{
          fontFamily: "'Syne', sans-serif", fontSize: "13px",
          fontWeight: 600, color: "#e5e5e5",
        }}>
          Episode {episode} airing in
        </span>
      </div>

      {/* Countdown blocks */}
      <div style={{ display: "flex", gap: "8px" }}>
        {[
          { value: timeLeft.days, label: "Days" },
          { value: timeLeft.hours, label: "Hours" },
          { value: timeLeft.minutes, label: "Min" },
          { value: timeLeft.seconds, label: "Sec" },
        ].map(({ value, label }) => (
          <div key={label} style={{
            flex: 1, background: "#0f0f0f",
            border: "1px solid #2a2a2a", borderRadius: "8px",
            padding: "10px 8px", textAlign: "center",
          }}>
            <div style={{
              fontFamily: "'Syne', sans-serif", fontSize: "22px",
              fontWeight: 700, color: "#e5e5e5", lineHeight: 1,
              marginBottom: "4px", fontVariantNumeric: "tabular-nums",
            }}>
              {String(value).padStart(2, "0")}
            </div>
            <div style={{ color: "#555", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}