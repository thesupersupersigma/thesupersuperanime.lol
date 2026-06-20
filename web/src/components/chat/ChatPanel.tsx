"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { getUserAvatar, getUserDisplayName } from "@/lib/user-utils";

interface ChatUser {
  id: string;
  discordUsername: string | null;
  discordAvatar: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarPreset?: number | null;
}

interface ChatMessageData {
  id: string;
  content: string;
  createdAt: string;
  deletedAt?: string | null;
  user: ChatUser;
}

interface ChatPanelProps {
  roomId: string; // "global" or "anime-{animeId}"
  currentUserId?: string;
  isAdmin?: boolean;
  height?: number; // default 400
  placeholder?: string; // default "Say something..."
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Merge incoming messages into the existing list, skipping ids we already have
// (optimistic sends + SSE backlog can overlap). Incoming are chronological so
// appending preserves order.
function mergeMessages(prev: ChatMessageData[], incoming: ChatMessageData[]) {
  if (incoming.length === 0) return prev;
  const seen = new Set(prev.map((m) => m.id));
  const added = incoming.filter((m) => !seen.has(m.id));
  if (added.length === 0) return prev;
  return [...prev, ...added];
}

export function ChatPanel({
  roomId,
  currentUserId,
  isAdmin = false,
  height = 400,
  placeholder = "Say something...",
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Initial load + live SSE stream.
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/chat/${roomId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.messages) return;
        setMessages((prev) => mergeMessages(prev, data.messages));
      })
      .catch(() => {});

    const es = new EventSource(`/api/chat/${roomId}/stream`);
    es.onmessage = (e) => {
      let data: { type?: string; messages?: ChatMessageData[] };
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      if (data.type === "messages" && Array.isArray(data.messages)) {
        setMessages((prev) => mergeMessages(prev, data.messages!));
      }
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [roomId]);

  // Keep scrolled to the newest message (contained to the panel, no page jump).
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat/${roomId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (res.status === 403) {
        setTimedOut(true);
        setError(data.error || "You are timed out");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Failed to send");
        return;
      }
      setMessages((prev) => mergeMessages(prev, [data.message]));
      setInput("");
    } catch {
      setError("Failed to send");
    } finally {
      setSending(false);
    }
  }, [input, sending, roomId]);

  async function handleDelete(messageId: string) {
    const res = await fetch(`/api/chat/${roomId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    if (res.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    }
  }

  async function handleTimeout(userId: string) {
    const answer = prompt("Timeout duration in minutes:", "60");
    if (answer === null) return;
    const durationMinutes = parseInt(answer, 10);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return;
    await fetch("/api/chat/timeout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, durationMinutes }),
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height }}>
      {/* Messages area — plain rows on the site background, no bubbles */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          background: "#0a0a0a",
        }}
      >
        {messages.length === 0 ? (
          <div style={{ color: "#333", fontSize: "13px", textAlign: "center", margin: "auto" }}>
            No messages yet.
          </div>
        ) : (
          messages.map((msg) => {
            const isDeleted = !!msg.deletedAt;
            return (
              <div
                key={msg.id}
                onMouseEnter={() => isAdmin && setHoveredId(msg.id)}
                onMouseLeave={() => isAdmin && setHoveredId((id) => (id === msg.id ? null : id))}
                style={{ display: "flex", gap: "10px" }}
              >
                <Image
                  src={getUserAvatar(msg.user)}
                  alt={getUserDisplayName(msg.user)}
                  width={32}
                  height={32}
                  style={{ borderRadius: "50%", flexShrink: 0, objectFit: "cover" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Header — name, time, and (admin) inline moderation buttons */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#e5e5e5" }}>
                      {getUserDisplayName(msg.user)}
                    </span>
                    {msg.user.discordUsername && (
                      <span style={{
                        fontSize: "10px", color: "#5865F2", fontWeight: 600,
                        background: "rgba(88,101,242,0.1)", padding: "1px 6px", borderRadius: "4px",
                      }}>
                        Discord
                      </span>
                    )}
                    <span style={{ fontSize: "11px", color: "#444" }}>{timeAgo(msg.createdAt)}</span>

                    {isAdmin && hoveredId === msg.id && !isDeleted && (
                      <>
                        <button
                          onClick={() => handleDelete(msg.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", padding: 0, color: "#555" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => handleTimeout(msg.user.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", padding: 0, color: "#555" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#f97316")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
                        >
                          Timeout
                        </button>
                      </>
                    )}
                  </div>

                  {/* Content */}
                  {isDeleted ? (
                    <p style={{ fontSize: "13px", color: "#555", fontStyle: "italic", margin: 0 }}>
                      [deleted]
                    </p>
                  ) : (
                    <p style={{ fontSize: "13px", color: "#aaa", lineHeight: "1.6", margin: 0, wordBreak: "break-word" }}>
                      {msg.content}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input row — matches the comment box styling */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #1a1a1a", background: "#111" }}>
        {!currentUserId ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#555", fontSize: "13px" }}>
            Sign in to chat
          </div>
        ) : (
          <>
            {error && (
              <div style={{ color: "#f87171", fontSize: "11px", marginBottom: "6px" }}>{error}</div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={timedOut ? "You are timed out" : placeholder}
                maxLength={500}
                disabled={timedOut}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                style={{
                  flex: 1,
                  background: "#0f0f0f",
                  border: "1px solid #2a2a2a",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  color: "#e5e5e5",
                  fontSize: "13px",
                  outline: "none",
                  fontFamily: "inherit",
                  opacity: timedOut ? 0.5 : 1,
                }}
                onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
                onBlur={(e) => (e.target.style.borderColor = "#2a2a2a")}
              />
              <button
                onClick={handleSend}
                disabled={sending || timedOut || !input.trim()}
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: sending || timedOut || !input.trim() ? "not-allowed" : "pointer",
                  opacity: sending || timedOut || !input.trim() ? 0.6 : 1,
                }}
              >
                {sending ? "..." : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
