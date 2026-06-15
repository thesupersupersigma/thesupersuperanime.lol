"use client";

import { useState } from "react";

const TYPES = [
  { value: "info",    label: "Info",    color: "#3b82f6" },
  { value: "warning", label: "Warning", color: "#f59e0b" },
  { value: "success", label: "Success", color: "#22c55e" },
  { value: "error",   label: "Error",   color: "#ef4444" },
];

export function AnnouncementPanel() {
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const publish = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", message, type }),
      });
      if (res.ok) {
        setStatus("Published!");
        setMessage("");
      } else {
        setStatus("Failed to publish");
      }
    } catch {
      setStatus("Error");
    } finally {
      setLoading(false);
    }
  };

  const clear = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      if (res.ok) setStatus("Cleared!");
      else setStatus("Failed to clear");
    } catch {
      setStatus("Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: "#111",
      border: "1px solid #1a1a1a",
      borderRadius: "12px",
      padding: "24px",
      marginBottom: "32px",
    }}>
      <h2 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: 700, color: "#e5e5e5" }}>
        📢 Announcements
      </h2>

      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        {TYPES.map(t => (
          <button
            key={t.value}
            onClick={() => setType(t.value)}
            style={{
              background: type === t.value ? t.color + "33" : "#1a1a1a",
              border: `1px solid ${type === t.value ? t.color : "#2a2a2a"}`,
              color: type === t.value ? t.color : "#888",
              borderRadius: "6px",
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Type your announcement..."
        rows={3}
        style={{
          width: "100%",
          background: "#1a1a1a",
          border: "1px solid #2a2a2a",
          borderRadius: "8px",
          color: "#e5e5e5",
          padding: "10px 12px",
          fontSize: "14px",
          fontFamily: "inherit",
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
          marginBottom: "12px",
        }}
      />

      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <button
          onClick={publish}
          disabled={loading || !message.trim()}
          style={{
            background: "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            padding: "8px 20px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: loading || !message.trim() ? "not-allowed" : "pointer",
            opacity: loading || !message.trim() ? 0.5 : 1,
            fontFamily: "inherit",
          }}
        >
          Publish
        </button>
        <button
          onClick={clear}
          disabled={loading}
          style={{
            background: "transparent",
            color: "#888",
            border: "1px solid #2a2a2a",
            borderRadius: "6px",
            padding: "8px 20px",
            fontSize: "13px",
            cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          Clear Active
        </button>
        {status && (
          <span style={{ fontSize: "13px", color: status.includes("!") ? "#22c55e" : "#ef4444" }}>
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
