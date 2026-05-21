"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { resetPasswordAction } from "../actions";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) setError("Invalid reset link. Please request a new one.");
  }, [token]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password")?.toString();
    const confirm = formData.get("confirm")?.toString();

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    formData.set("token", token);
    setLoading(true);
    setError(null);

    try {
      const res = await resetPasswordAction(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        // Success — logged in automatically, go to account
        router.push("/account");
        router.refresh();
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0a",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{
        width: "100%", maxWidth: "420px",
        background: "#111", border: "1px solid #2a2a2a",
        borderRadius: "16px", padding: "40px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, width: "100%", height: "1px",
          background: "linear-gradient(to right, transparent, rgba(59,130,246,0.5), transparent)",
        }} />

        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontSize: "24px",
          fontWeight: 700, color: "#e5e5e5", letterSpacing: "-0.02em",
          marginBottom: "8px",
        }}>
          Set new password
        </h1>
        <p style={{ color: "#666", fontSize: "13px", marginBottom: "32px" }}>
          Choose a strong password for your account.
        </p>

        {error && (
          <div style={{
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
            color: "#f87171", fontSize: "13px", padding: "12px 16px",
            borderRadius: "8px", marginBottom: "20px", textAlign: "center",
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {(["password", "confirm"] as const).map((field) => (
            <div key={field} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {field === "password" ? "New Password" : "Confirm Password"}
              </label>
              <input
                type="password" name={field} required minLength={6}
                placeholder="••••••••"
                style={{
                  background: "#0f0f0f", border: "1px solid #2a2a2a",
                  borderRadius: "8px", padding: "12px 16px",
                  color: "#e5e5e5", fontSize: "14px", outline: "none",
                  width: "100%", boxSizing: "border-box",
                }}
                onFocus={e => (e.target.style.borderColor = "#3b82f6")}
                onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
              />
            </div>
          ))}

          <button
            type="submit" disabled={loading || !token}
            style={{
              background: "#2563eb", color: "#fff", border: "none",
              borderRadius: "8px", padding: "13px", fontWeight: 700,
              fontSize: "14px", cursor: (loading || !token) ? "not-allowed" : "pointer",
              opacity: (loading || !token) ? 0.6 : 1, marginTop: "8px",
            }}
            onMouseEnter={e => { if (!loading && token) (e.currentTarget.style.background = "#1d4ed8") }}
            onMouseLeave={e => { if (!loading && token) (e.currentTarget.style.background = "#2563eb") }}
          >
            {loading ? "Updating..." : "Set New Password"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}