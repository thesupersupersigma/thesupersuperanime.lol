"use client";

import { useState } from "react";
import { resendVerificationEmailAction } from "@/app/account/actions";

export default function VerifyEmailPendingPage() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleResend() {
    setStatus("sending");
    const result = await resendVerificationEmailAction();
    if ("success" in result && result.success) {
      setStatus("sent");
    } else {
      setStatus("error");
      setErrorMsg("error" in result ? (result.error ?? "Something went wrong.") : "Something went wrong.");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#e5e5e5",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: "420px",
          width: "100%",
          background: "#111",
          border: "1px solid #2a2a2a",
          borderRadius: "12px",
          padding: "40px 32px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "40px", marginBottom: "20px" }}>📬</div>
        <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
          Check your email
        </h1>
        <p style={{ color: "#888", fontSize: "14px", lineHeight: 1.6, marginBottom: "28px" }}>
          We sent a verification link to your email address. Click it to verify your account and
          access the site.
        </p>

        {status === "sent" ? (
          <p style={{ color: "#22c55e", fontSize: "13px" }}>
            ✓ New verification email sent — check your inbox.
          </p>
        ) : status === "error" ? (
          <p style={{ color: "#ef4444", fontSize: "13px" }}>{errorMsg}</p>
        ) : (
          <button
            onClick={handleResend}
            disabled={status === "sending"}
            style={{
              background: status === "sending" ? "#1e3a8a" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "10px 24px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: status === "sending" ? "not-allowed" : "pointer",
              opacity: status === "sending" ? 0.7 : 1,
            }}
          >
            {status === "sending" ? "Sending…" : "Resend verification email"}
          </button>
        )}

        <p style={{ marginTop: "24px", fontSize: "12px", color: "#555" }}>
          Already verified?{" "}
          <a href="/account" style={{ color: "#2563eb", textDecoration: "none" }}>
            Go to account
          </a>
          {" "}·{" "}
          <a href="/account" style={{ color: "#555", textDecoration: "none" }}>
            Log out
          </a>
        </p>
      </div>
    </div>
  );
}
