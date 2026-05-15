"use client";

import { useState } from "react";
import { signUpAction, signInAction } from "./actions";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const action = isLogin ? signInAction : signUpAction;

    try {
      const res = await action(formData);
      if (res?.error) setError(res.error);
      if (res?.success) router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      width: "100%",
      maxWidth: "420px",
      background: "#111",
      border: "1px solid #2a2a2a",
      borderRadius: "16px",
      padding: "40px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Top accent line — matches the card style from homepage */}
      <div style={{
        position: "absolute",
        top: 0, left: 0,
        width: "100%",
        height: "1px",
        background: "linear-gradient(to right, transparent, rgba(59,130,246,0.5), transparent)",
      }} />

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "26px",
          fontWeight: 700,
          color: "#e5e5e5",
          letterSpacing: "-0.02em",
          marginBottom: "10px",
        }}>
          {isLogin ? "Welcome back" : "Create account"}
        </h1>
        <p style={{ color: "#666", fontSize: "13px", lineHeight: "1.6" }}>
          {isLogin
            ? "Sign in to sync your watch history across devices."
            : "Sign up to track progress, save watchlists, and import from other sites."}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.25)",
          color: "#f87171",
          fontSize: "13px",
          padding: "12px 16px",
          borderRadius: "8px",
          marginBottom: "20px",
          textAlign: "center",
        }}>
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "#888",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}>
            Email Address
          </label>
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            style={{
              background: "#0f0f0f",
              border: "1px solid #2a2a2a",
              borderRadius: "8px",
              padding: "12px 16px",
              color: "#e5e5e5",
              fontSize: "14px",
              outline: "none",
              transition: "border-color 0.2s",
              width: "100%",
              boxSizing: "border-box",
            }}
            onFocus={e => (e.target.style.borderColor = "#3b82f6")}
            onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "#888",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}>
            Password
          </label>
          <input
            type="password"
            name="password"
            required
            placeholder="••••••••"
            style={{
              background: "#0f0f0f",
              border: "1px solid #2a2a2a",
              borderRadius: "8px",
              padding: "12px 16px",
              color: "#e5e5e5",
              fontSize: "14px",
              outline: "none",
              transition: "border-color 0.2s",
              width: "100%",
              boxSizing: "border-box",
            }}
            onFocus={e => (e.target.style.borderColor = "#3b82f6")}
            onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? "#1d4ed8" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            padding: "13px",
            fontWeight: 700,
            fontSize: "14px",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            marginTop: "8px",
            transition: "background 0.2s, opacity 0.2s",
          }}
          onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.background = "#1d4ed8" }}
          onMouseLeave={e => { if (!loading) (e.target as HTMLButtonElement).style.background = "#2563eb" }}
        >
          {loading ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
        </button>
      </form>

      {/* Toggle */}
      <p style={{ textAlign: "center", marginTop: "24px", fontSize: "13px", color: "#555" }}>
        {isLogin ? "Don't have an account? " : "Already have an account? "}
        <button
          type="button"
          onClick={() => { setIsLogin(!isLogin); setError(null); }}
          style={{
            background: "none",
            border: "none",
            color: "#a3a3a3",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: "13px",
            padding: 0,
            transition: "color 0.2s",
          }}
          onMouseEnter={e => (e.target as HTMLButtonElement).style.color = "#fff"}
          onMouseLeave={e => (e.target as HTMLButtonElement).style.color = "#a3a3a3"}
        >
          {isLogin ? "Sign Up" : "Sign In"}
        </button>
      </p>
    </div>
  );
}