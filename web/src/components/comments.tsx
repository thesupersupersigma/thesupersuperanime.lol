"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { getUserAvatar, getUserDisplayName } from "@/lib/user-utils";

interface CommentUser {
  id: string;
  discordUsername: string | null;
  discordAvatar: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarPreset?: number | null;
}

interface CommentData {
  id: string;
  content: string;
  isSpoiler: boolean;
  createdAt: string;
  user: CommentUser | null;
  likeCount: number;
  likedByMe: boolean;
  replies: CommentData[];
  deleted?: boolean;
}

interface Props {
  animeId: number;
  episodeId?: string;
  currentUserId?: string;
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

function Avatar({ user }: { user: CommentUser }) {
  const src = getUserAvatar(user);
  const name = getUserDisplayName(user);
  return (
    <Image
      src={src}
      alt={name}
      width={32}
      height={32}
      style={{ borderRadius: "50%", flexShrink: 0, objectFit: "cover" }}
    />
  );
}

function CommentCard({
  comment,
  currentUserId,
  animeId,
  episodeId,
  onReplyPosted,
  onDeleted,
  onLikeToggled,
  isReply = false,
}: {
  comment: CommentData;
  currentUserId?: string;
  animeId: number;
  episodeId?: string;
  onReplyPosted: (parentId: string, reply: CommentData) => void;
  onDeleted: (commentId: string, parentId?: string) => void;
  onLikeToggled: (commentId: string, liked: boolean, parentId?: string) => void;
  isReply?: boolean;
}) {
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [posting, setPosting] = useState(false);
  const [liking, setLiking] = useState(false);

  const isLiked = comment.likedByMe;
  const likeCount = comment.likeCount;
  const isOwn = comment.user?.id === currentUserId;
  const isDeleted = comment.deleted === true;

  async function handleLike() {
    if (!currentUserId || liking) return;
    setLiking(true);
    try {
      const res = await fetch("/api/comments/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId: comment.id }),
      });
      const data = await res.json();
      onLikeToggled(comment.id, data.liked, isReply ? comment.id : undefined);
    } finally {
      setLiking(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this comment?")) return;
    await fetch("/api/comments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId: comment.id }),
    });
    onDeleted(comment.id);
  }

  async function handleReply() {
    if (!replyText.trim() || posting) return;
    setPosting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          animeId,
          episodeId: episodeId ?? null,
          content: replyText.trim(),
          isSpoiler: false,
          parentId: comment.id,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onReplyPosted(comment.id, data.comment);
        setReplyText("");
        setShowReplyBox(false);
      }
    } finally {
      setPosting(false);
    }
  }

  return (
    <div style={{
      display: "flex", gap: "10px",
      paddingLeft: isReply ? "42px" : "0",
    }}>
      {isDeleted || !comment.user ? (
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "#1a1a1a", flexShrink: 0,
        }} />
      ) : (
        <Avatar user={comment.user} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <span style={{
            fontSize: "13px", fontWeight: 600,
            color: isDeleted ? "#555" : "#e5e5e5",
            fontStyle: isDeleted ? "italic" : "normal",
          }}>
            {isDeleted || !comment.user ? "[deleted]" : getUserDisplayName(comment.user)}
          </span>
          {!isDeleted && comment.user?.discordUsername && (
            <span style={{
              fontSize: "10px", color: "#5865F2", fontWeight: 600,
              background: "rgba(88,101,242,0.1)", padding: "1px 6px", borderRadius: "4px",
            }}>
              Discord
            </span>
          )}
          <span style={{ fontSize: "11px", color: "#444" }}>{timeAgo(comment.createdAt)}</span>
        </div>

        {/* Content */}
        {isDeleted ? (
          <p style={{
            fontSize: "13px", color: "#555", fontStyle: "italic",
            lineHeight: "1.6", margin: "0 0 8px 0",
          }}>
            [deleted]
          </p>
        ) : comment.isSpoiler && !spoilerRevealed ? (
          <div
            onClick={() => setSpoilerRevealed(true)}
            style={{
              background: "#1a1a1a", border: "1px solid #2a2a2a",
              borderRadius: "6px", padding: "8px 12px",
              fontSize: "13px", color: "#555", cursor: "pointer",
              userSelect: "none", marginBottom: "8px",
            }}
          >
            ⚠ Spoiler — click to reveal
          </div>
        ) : (
          <p style={{
            fontSize: "13px", color: "#aaa", lineHeight: "1.6",
            margin: "0 0 8px 0", wordBreak: "break-word",
          }}>
            {comment.isSpoiler && (
              <span style={{ fontSize: "10px", color: "#f59e0b", marginRight: "6px", fontWeight: 600 }}>
                SPOILER
              </span>
            )}
            {comment.content}
          </p>
        )}

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {!isDeleted && (
            <button
              onClick={handleLike}
              style={{
                background: "none", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "4px",
                color: isLiked ? "#3b82f6" : "#555", fontSize: "12px",
                padding: 0, transition: "color 0.15s",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              {likeCount > 0 && <span>{likeCount}</span>}
            </button>
          )}

          {!isReply && currentUserId && (
            <button
              onClick={() => setShowReplyBox(!showReplyBox)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#555", fontSize: "12px", padding: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#a3a3a3")}
              onMouseLeave={e => (e.currentTarget.style.color = "#555")}
            >
              Reply
            </button>
          )}

          {isOwn && (
            <button
              onClick={handleDelete}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#555", fontSize: "12px", padding: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
              onMouseLeave={e => (e.currentTarget.style.color = "#555")}
            >
              Delete
            </button>
          )}
        </div>

        {/* Reply box */}
        {showReplyBox && (
          <div style={{ marginTop: "10px", display: "flex", gap: "8px" }}>
            <input
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Write a reply..."
              maxLength={1000}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
              style={{
                flex: 1, background: "#0f0f0f", border: "1px solid #2a2a2a",
                borderRadius: "6px", padding: "8px 12px", color: "#e5e5e5",
                fontSize: "13px", outline: "none",
              }}
              onFocus={e => (e.target.style.borderColor = "#3b82f6")}
              onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
            />
            <button
              onClick={handleReply}
              disabled={posting || !replyText.trim()}
              style={{
                background: "#2563eb", color: "#fff", border: "none",
                borderRadius: "6px", padding: "8px 14px",
                fontSize: "12px", fontWeight: 600,
                cursor: posting ? "not-allowed" : "pointer",
                opacity: posting ? 0.6 : 1,
              }}
            >
              {posting ? "..." : "Reply"}
            </button>
          </div>
        )}

        {/* Replies */}
        {(comment.replies ?? []).length > 0 && (
          <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {(comment.replies ?? []).map(reply => (
              <CommentCard
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                animeId={animeId}
                episodeId={episodeId}
                onReplyPosted={onReplyPosted}
                onDeleted={(id) => onDeleted(id, comment.id)}
                onLikeToggled={(id, liked) => onLikeToggled(id, liked, comment.id)}
                isReply
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Comments({ animeId, episodeId, currentUserId }: Props) {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/comments?animeId=${animeId}${episodeId ? `&episodeId=${episodeId}` : ""}`);
      const data = await res.json();
      setComments(data.comments ?? []);
    } finally {
      setLoading(false);
    }
  }, [animeId, episodeId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  async function handlePost() {
    if (!text.trim() || posting) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId, episodeId: episodeId ?? null, content: text.trim(), isSpoiler }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setComments(prev => [{ ...data.comment, replies: [] }, ...prev]);
      setText("");
      setIsSpoiler(false);
    } finally {
      setPosting(false);
    }
  }

  function handleReplyPosted(parentId: string, reply: CommentData) {
    setComments(prev => prev.map(c =>
      c.id === parentId ? { ...c, replies: [...c.replies, reply] } : c
    ));
  }

  function handleDeleted() {
    // Re-sync from the server rather than optimistically dropping the row: a
    // deleted top-level comment that still has replies should reappear as a
    // "[deleted]" tombstone (with its thread), which only the refetch knows.
    loadComments();
  }

  function handleLikeToggled(commentId: string, liked: boolean, parentId?: string) {
    const updateLikes = (c: CommentData): CommentData => {
      if (c.id !== commentId) return c;
      return {
        ...c,
        likedByMe: liked,
        likeCount: c.likeCount + (liked ? 1 : -1),
      };
    };

    setComments(prev => prev.map(c => ({
      ...updateLikes(c),
      replies: (c.replies ?? []).map(updateLikes),
    })));
  }

  return (
    <section style={{ marginTop: "48px" }}>
      <h2 style={{
        fontFamily: "'Syne', sans-serif", fontSize: "16px",
        fontWeight: 600, color: "#e5e5e5", marginBottom: "20px",
      }}>
        {episodeId ? "Episode Comments" : "Comments"} {comments.length > 0 && (
          <span style={{ color: "#555", fontWeight: 400, fontSize: "14px" }}>
            ({comments.length})
          </span>
        )}
      </h2>

      {/* Post box — only for logged-in users */}
      {currentUserId ? (
        <div style={{
          background: "#111", border: "1px solid #2a2a2a",
          borderRadius: "12px", padding: "16px", marginBottom: "24px",
        }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Share your thoughts..."
            maxLength={1000}
            rows={3}
            style={{
              width: "100%", background: "#0f0f0f",
              border: "1px solid #2a2a2a", borderRadius: "8px",
              padding: "10px 14px", color: "#e5e5e5", fontSize: "13px",
              lineHeight: "1.6", outline: "none", resize: "vertical",
              boxSizing: "border-box", fontFamily: "inherit",
            }}
            onFocus={e => (e.target.style.borderColor = "#3b82f6")}
            onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
          />
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between", marginTop: "10px",
          }}>
            <label style={{
              display: "flex", alignItems: "center", gap: "6px",
              cursor: "pointer", fontSize: "12px", color: "#555",
            }}>
              <input
                type="checkbox"
                checked={isSpoiler}
                onChange={e => setIsSpoiler(e.target.checked)}
                style={{ accentColor: "#f59e0b" }}
              />
              Mark as spoiler
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {error && <span style={{ color: "#f87171", fontSize: "12px" }}>{error}</span>}
              <span style={{ color: "#444", fontSize: "11px" }}>
                {text.length}/1000
              </span>
              <button
                onClick={handlePost}
                disabled={posting || !text.trim()}
                style={{
                  background: "#2563eb", color: "#fff", border: "none",
                  borderRadius: "6px", padding: "8px 18px",
                  fontSize: "13px", fontWeight: 600,
                  cursor: (posting || !text.trim()) ? "not-allowed" : "pointer",
                  opacity: (posting || !text.trim()) ? 0.6 : 1,
                }}
              >
                {posting ? "Posting..." : "Post"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          background: "#111", border: "1px solid #2a2a2a",
          borderRadius: "12px", padding: "20px", marginBottom: "24px",
          textAlign: "center", color: "#555", fontSize: "13px",
        }}>
          Sign in to leave a comment
        </div>
      )}

      {/* Comment list */}
      {loading ? (
        <div style={{ color: "#444", fontSize: "13px", textAlign: "center", padding: "32px" }}>
          Loading comments...
        </div>
      ) : comments.length === 0 ? (
        <div style={{ color: "#333", fontSize: "13px", textAlign: "center", padding: "32px" }}>
          No comments yet. Be the first!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {comments.map(comment => (
            <CommentCard
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              animeId={animeId}
              episodeId={episodeId}
              onReplyPosted={handleReplyPosted}
              onDeleted={handleDeleted}
              onLikeToggled={handleLikeToggled}
            />
          ))}
        </div>
      )}
    </section>
  );
}