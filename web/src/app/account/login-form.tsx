"use client";

import { useState } from "react";
import { signUpAction, signInAction, requestPasswordResetAction } from "./actions";
import { useRouter } from "next/navigation";

type View = "login" | "signup" | "forgot"

export function LoginForm() {
  const router = useRouter();
  const [view, setView] = useState<View>("login");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);

    try {
      if (view === "forgot") {
        const res = await requestPasswordResetAction(formData);
        if (res?.error) setError(res.error);
        if (res?.success) setSuccess("If that email exists, a reset link is on its way.");
      } else {
        const action = view === "login" ? signInAction : signUpAction;
        const res = await action(formData);
        if (res?.error) setError(res.error);
        if (res?.success) router.refresh();
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  const titles: Record<View, string> = {
    login: "Welcome back",
    signup: "Create account",
    forgot: "Reset password",
  }

  const subtitles: Record<View, string> = {
    login: "Sign in to sync your watch history across devices.",
    signup: "Sign up to track progress, save watchlists, and import from other sites.",
    forgot: "Enter your email and we'll send you a reset link.",
  }

  return (
    <div style={{
      width: "100%", maxWidth: "420px",
      background: "#111", border: "1px solid #2a2a2a",
      borderRadius: "16px", padding: "40px",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0,
        width: "100%", height: "1px",
        background: "linear-gradient(to right, transparent, rgba(59,130,246,0.5), transparent)",
      }} />

      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontSize: "26px",
          fontWeight: 700, color: "#e5e5e5", letterSpacing: "-0.02em", marginBottom: "10px",
        }}>
          {titles[view]}
        </h1>
        <p style={{ color: "#666", fontSize: "13px", lineHeight: "1.6" }}>
          {subtitles[view]}
        </p>
      </div>

      {error && (
        <div style={{
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
          color: "#f87171", fontSize: "13px", padding: "12px 16px",
          borderRadius: "8px", marginBottom: "20px", textAlign: "center",
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)",
          color: "#4ade80", fontSize: "13px", padding: "12px 16px",
          borderRadius: "8px", marginBottom: "20px", textAlign: "center",
        }}>
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label style={{ fontSize: "11px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Email Address
          </label>
          <input
            type="email" name="email" required placeholder="you@example.com"
            style={{
              background: "#0f0f0f", border: "1px solid #2a2a2a", borderRadius: "8px",
              padding: "12px 16px", color: "#e5e5e5", fontSize: "14px",
              outline: "none", width: "100%", boxSizing: "border-box",
            }}
            onFocus={e => (e.target.style.borderColor = "#3b82f6")}
            onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
          />
        </div>

        {view !== "forgot" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Password
              </label>
              {view === "login" && (
                <button
                  type="button"
                  onClick={() => { setView("forgot"); setError(null); setSuccess(null); }}
                  style={{
                    background: "none", border: "none", color: "#555",
                    fontSize: "11px", cursor: "pointer", padding: 0,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#a3a3a3")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#555")}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <input
              type="password" name="password" required placeholder="••••••••"
              style={{
                background: "#0f0f0f", border: "1px solid #2a2a2a", borderRadius: "8px",
                padding: "12px 16px", color: "#e5e5e5", fontSize: "14px",
                outline: "none", width: "100%", boxSizing: "border-box",
              }}
              onFocus={e => (e.target.style.borderColor = "#3b82f6")}
              onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
            />
          </div>
        )}

        <button
          type="submit" disabled={loading}
          style={{
            background: "#2563eb", color: "#fff", border: "none",
            borderRadius: "8px", padding: "13px", fontWeight: 700,
            fontSize: "14px", cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1, marginTop: "8px",
          }}
          onMouseEnter={e => { if (!loading) (e.currentTarget.style.background = "#1d4ed8") }}
          onMouseLeave={e => { if (!loading) (e.currentTarget.style.background = "#2563eb") }}
        >
          {loading ? "Please wait..." : view === "login" ? "Sign In" : view === "signup" ? "Create Account" : "Send Reset Link"}
        </button>
      </form>

      <div style={{ marginTop: "24px", textAlign: "center", display: "flex", flexDirection: "column", gap: "10px" }}>
        {view === "forgot" ? (
          <button type="button" onClick={() => { setView("login"); setError(null); setSuccess(null); }}
            style={{ background: "none", border: "none", color: "#555", fontSize: "13px", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#a3a3a3")}
            onMouseLeave={e => (e.currentTarget.style.color = "#555")}
          >
            ← Back to sign in
          </button>
        ) : (
          <p style={{ fontSize: "13px", color: "#555" }}>
            {view === "login" ? "Don't have an account? " : "Already have an account? "}
            <button type="button"
              onClick={() => { setView(view === "login" ? "signup" : "login"); setError(null); }}
              style={{ background: "none", border: "none", color: "#a3a3a3", fontWeight: 600, cursor: "pointer", fontSize: "13px", padding: 0 }}
              onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={e => (e.currentTarget.style.color = "#a3a3a3")}
            >
              {view === "login" ? "Sign Up" : "Sign In"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}