"use client";

import { useState, useEffect, type CSSProperties } from "react";
import Image from "next/image";
import { getUserAvatar, getUserDisplayName } from "@/lib/user-utils";
import { ChatPanel } from "./ChatPanel";

interface Channel {
  id: string;
  name: string;
  description?: string;
  position: number;
}

interface OnlineUser {
  id: string;
  discordUsername: string | null;
  discordAvatar: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarPreset?: number | null;
}

interface ApiChannel {
  id: string;
  name: string;
  description: string | null;
  position: number;
}

interface DiscordChatProps {
  userId: string;
  isAdmin: boolean;
  initialChannels: Channel[];
}

function toChannel(c: ApiChannel): Channel {
  return { id: c.id, name: c.name, description: c.description ?? undefined, position: c.position };
}

const ghostInput: CSSProperties = {
  background: "#0f0f0f",
  border: "1px solid #2a2a2a",
  borderRadius: 4,
  padding: "6px 8px",
  color: "#e5e5e5",
  fontSize: 12,
  outline: "none",
  fontFamily: "inherit",
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#555",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

export function DiscordChat({ userId, isAdmin, initialChannels }: DiscordChatProps) {
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [activeChannelId, setActiveChannelId] = useState<string>(initialChannels[0]?.id ?? "");
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [hoveredChannelId, setHoveredChannelId] = useState<string | null>(null);

  // Create-channel form (admin only).
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  // Poll the online list on mount + every 60s (presence, no live socket needed).
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/chat/online")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!cancelled && Array.isArray(data?.users)) setOnlineUsers(data.users);
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function handleCreateChannel() {
    const name = newChannelName.trim().replace(/^#/, "").toLowerCase();
    if (name.length < 1 || name.length > 32 || !/^[a-z0-9-]+$/.test(name)) {
      setCreateError("Lowercase letters, numbers and hyphens only (1–32 chars)");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/chat/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: newChannelDesc.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "Failed to create channel");
        return;
      }
      const channel = toChannel(data.channel);
      setChannels((prev) => [...prev, channel].sort((a, b) => a.position - b.position));
      setActiveChannelId(channel.id);
      setNewChannelName("");
      setNewChannelDesc("");
      setShowCreateChannel(false);
    } catch {
      setCreateError("Failed to create channel");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteChannel(id: string) {
    if (channels.length <= 1) return;
    if (!confirm("Delete this channel? All of its messages will be removed.")) return;
    const res = await fetch("/api/chat/channels", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: id }),
    });
    if (!res.ok) return;
    const next = channels.filter((c) => c.id !== id);
    setChannels(next);
    if (id === activeChannelId) setActiveChannelId(next[0]?.id ?? "");
  }

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", overflow: "hidden" }}>
      {/* ── Left sidebar — channels ───────────────────────────────── */}
      <div style={{
        width: 220, flexShrink: 0, background: "#111",
        borderRight: "1px solid #1a1a1a", display: "flex", flexDirection: "column", height: "100%",
      }}>
        {/* Server header */}
        <div style={{
          height: 48, flexShrink: 0, borderBottom: "1px solid #1a1a1a",
          padding: "0 16px", display: "flex", alignItems: "center",
        }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: "#e5e5e5" }}>
            thesupersuperanime
          </span>
        </div>

        {/* CHANNELS label + admin add button */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 8px 4px 16px",
        }}>
          <span style={labelStyle}>Channels</span>
          {isAdmin && (
            <button
              onClick={() => setShowCreateChannel((s) => !s)}
              title="Create channel"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#555", fontSize: 16, lineHeight: 1, padding: "0 4px" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#e5e5e5")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
            >
              +
            </button>
          )}
        </div>

        {/* Channel list */}
        <div className="chat-sidebar-scroll">
          {channels.map((c) => {
            const active = c.id === activeChannelId;
            const hovered = hoveredChannelId === c.id;
            return (
              <div
                key={c.id}
                onClick={() => setActiveChannelId(c.id)}
                onMouseEnter={() => setHoveredChannelId(c.id)}
                onMouseLeave={() => setHoveredChannelId((id) => (id === c.id ? null : id))}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "4px 8px", borderRadius: 4, margin: "1px 8px", cursor: "pointer",
                  background: active ? "#2a2a2a" : hovered ? "#1f1f1f" : "transparent",
                  color: active ? "#e5e5e5" : hovered ? "#a3a3a3" : "#666",
                  transition: "background 100ms, color 100ms",
                }}
              >
                <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ color: "#555" }}># </span>{c.name}
                </span>
                {isAdmin && channels.length > 1 && hovered && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteChannel(c.id); }}
                    title="Delete channel"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#555", fontSize: 14, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Create channel form */}
        {isAdmin && showCreateChannel && (
          <div style={{ padding: "10px 12px", borderTop: "1px solid #1a1a1a", display: "flex", flexDirection: "column", gap: 6 }}>
            <input
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="#channel-name"
              maxLength={32}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateChannel(); } }}
              style={ghostInput}
              onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
              onBlur={(e) => (e.target.style.borderColor = "#2a2a2a")}
            />
            <input
              value={newChannelDesc}
              onChange={(e) => setNewChannelDesc(e.target.value)}
              placeholder="Description (optional)"
              maxLength={120}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateChannel(); } }}
              style={ghostInput}
              onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
              onBlur={(e) => (e.target.style.borderColor = "#2a2a2a")}
            />
            {createError && <span style={{ color: "#f87171", fontSize: 11 }}>{createError}</span>}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={handleCreateChannel}
                disabled={creating || !newChannelName.trim()}
                style={{
                  background: "#2563eb", color: "#fff", border: "none", borderRadius: 4,
                  padding: "6px 12px", fontSize: 12, fontWeight: 600,
                  cursor: creating || !newChannelName.trim() ? "not-allowed" : "pointer",
                  opacity: creating || !newChannelName.trim() ? 0.6 : 1,
                }}
              >
                {creating ? "..." : "Create"}
              </button>
              <button
                onClick={() => { setShowCreateChannel(false); setCreateError(null); }}
                style={{ background: "none", border: "1px solid #2a2a2a", color: "#888", borderRadius: 4, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Center — channel header + messages ────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100%", background: "#0a0a0a" }}>
        <div style={{
          height: 48, flexShrink: 0, borderBottom: "1px solid #1a1a1a",
          padding: "0 16px", display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ color: "#555", fontSize: 18 }}>#</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5" }}>
            {activeChannel?.name ?? ""}
          </span>
          {activeChannel?.description && (
            <>
              <span style={{ color: "#2a2a2a" }}>|</span>
              <span style={{ fontSize: 13, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeChannel.description}
              </span>
            </>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          {activeChannelId && (
            <ChatPanel
              key={activeChannelId}
              roomId={`channel-${activeChannelId}`}
              currentUserId={userId}
              isAdmin={isAdmin}
              fillHeight
              placeholder={activeChannel ? `Message #${activeChannel.name}` : "Say something..."}
            />
          )}
        </div>
      </div>

      {/* ── Right sidebar — online users ──────────────────────────── */}
      <div style={{
        width: 200, flexShrink: 0, background: "#111",
        borderLeft: "1px solid #1a1a1a", display: "flex", flexDirection: "column", height: "100%",
      }}>
        <div style={{
          height: 48, flexShrink: 0, borderBottom: "1px solid #1a1a1a",
          padding: "0 16px", display: "flex", alignItems: "center",
        }}>
          <span style={labelStyle}>Online</span>
        </div>
        <div className="chat-sidebar-scroll" style={{ padding: "8px 0" }}>
          {onlineUsers.length === 0 ? (
            <div style={{ color: "#555", fontSize: 12, padding: "8px 16px" }}>No one online</div>
          ) : (
            onlineUsers.map((u) => (
              <div
                key={u.id}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 4, margin: "0 8px" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#1f1f1f")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Image
                  src={getUserAvatar(u)}
                  alt={getUserDisplayName(u)}
                  width={32}
                  height={32}
                  style={{ borderRadius: "50%", flexShrink: 0, objectFit: "cover" }}
                />
                <span style={{ fontSize: 13, color: "#a3a3a3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {getUserDisplayName(u)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
