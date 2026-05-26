"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { resendVerificationEmailAction } from "@/app/account/actions";

interface Props {
  email: string;
}

export default function VerifyEmailPendingClient({ email }: Props) {
  const router = useRouter();
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll /api/auth/me every 3s — redirect to setup-profile as soon as verified
  const startPolling = useCallback(() => {
    if (pollRef.current) return; // already polling
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.emailVerified) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          router.replace("/account/setup-profile");
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 3000);
  }, [router]);

  useEffect(() => {
    startPolling();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [startPolling]);

  async function handleResend() {
    if (cooldown > 0 || resendStatus === "sending") return;
    setResendStatus("sending");
    setErrorMsg("");

    const result = await resendVerificationEmailAction();

    if ("success" in result && result.success) {
      setResendStatus("sent");
      setCooldown(60);
      cooldownRef.current = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) {
            clearInterval(cooldownRef.current!);
            cooldownRef.current = null;
            setResendStatus("idle");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setResendStatus("error");
      setErrorMsg(
        "error" in result ? (result.error ?? "Something went wrong.") : "Something went wrong."
      );
    }
  }

  const resendDisabled = cooldown > 0 || resendStatus === "sending";
  const resendLabel =
    resendStatus === "sending"
      ? "Sending…"
      : cooldown > 0
      ? `Resend in ${cooldown}s`
      : "Resend email";

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
      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(0.8); opacity: 0.6; }
          50%  { transform: scale(1.15); opacity: 0.15; }
          100% { transform: scale(0.8); opacity: 0.6; }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>

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
        {/* Pulsing indicator */}
        <div
          style={{
            position: "relative",
            width: "56px",
            height: "56px",
            margin: "0 auto 24px",
          }}
        >
          {/* Outer pulse ring */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "rgba(37,99,235,0.25)",
              animation: "pulse-ring 2s ease-in-out infinite",
            }}
          />
          {/* Inner dot */}
          <div
            style={{
              position: "absolute",
              inset: "12px",
              borderRadius: "50%",
              background: "#2563eb",
              animation: "pulse-dot 2s ease-in-out infinite",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
        </div>

        <h1
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "20px",
            fontWeight: 700,
            color: "#e5e5e5",
            marginBottom: "12px",
            letterSpacing: "-0.01em",
          }}
        >
          Check your email
        </h1>

        <p
          style={{
            color: "#888",
            fontSize: "14px",
            lineHeight: 1.6,
            marginBottom: "8px",
          }}
        >
          We sent a verification email to{" "}
          {email ? (
            <span style={{ color: "#d4d4d4", fontWeight: 600 }}>{email}</span>
          ) : (
            "your inbox"
          )}
          .
        </p>
        <p
          style={{
            color: "#555",
            fontSize: "13px",
            lineHeight: 1.6,
            marginBottom: "28px",
          }}
        >
          Open it and click the link to continue. This tab will advance automatically.
        </p>

        {/* Resend section */}
        {resendStatus === "sent" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
            <p style={{ color: "#22c55e", fontSize: "13px", margin: 0 }}>
              ✓ New verification email sent — check your inbox.
            </p>
            {cooldown > 0 && (
              <p style={{ color: "#444", fontSize: "12px", margin: 0 }}>
                Resend available in {cooldown}s
              </p>
            )}
          </div>
        ) : resendStatus === "error" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
            <p style={{ color: "#f87171", fontSize: "13px", margin: 0 }}>{errorMsg}</p>
            <button
              onClick={() => { setResendStatus("idle"); setErrorMsg(""); }}
              style={{
                background: "none", border: "none", color: "#555",
                fontSize: "12px", cursor: "pointer", padding: 0,
              }}
            >
              Try again
            </button>
          </div>
        ) : (
          <button
            onClick={handleResend}
            disabled={resendDisabled}
            style={{
              background: resendDisabled ? "#1a1a1a" : "#1e293b",
              color: resendDisabled ? "#444" : "#a3a3a3",
              border: "1px solid #2a2a2a",
              borderRadius: "8px",
              padding: "9px 20px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: resendDisabled ? "not-allowed" : "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={e => {
              if (!resendDisabled) {
                e.currentTarget.style.background = "#253044";
                e.currentTarget.style.color = "#e5e5e5";
              }
            }}
            onMouseLeave={e => {
              if (!resendDisabled) {
                e.currentTarget.style.background = "#1e293b";
                e.currentTarget.style.color = "#a3a3a3";
              }
            }}
          >
            {resendLabel}
          </button>
        )}

        <p style={{ marginTop: "28px", fontSize: "12px", color: "#444" }}>
          Wrong account?{" "}
          <a href="/account" style={{ color: "#555", textDecoration: "none" }}>
            Sign out
          </a>
        </p>
      </div>
    </div>
  );
}
