"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { verifyEmailAction } from "@/app/account/actions";

type State = "loading" | "success" | "error";

// Inner component — isolated here so useSearchParams() is inside a Suspense boundary
function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get("token");

  const [state, setState] = useState<State>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setErrorMsg("No verification token found. Make sure you copied the full link from your email.");
      return;
    }

    verifyEmailAction(token).then(result => {
      if ("success" in result && result.success) {
        setState("success");
        // No redirect — Tab A is polling and will advance automatically.
        // Browsers block window.close() so we just show a static message.
      } else {
        setState("error");
        setErrorMsg("error" in result ? (result.error ?? "Something went wrong.") : "Something went wrong.");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
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
      {state === "loading" && (
        <>
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "3px solid #2a2a2a",
              borderTop: "3px solid #2563eb",
              borderRadius: "50%",
              margin: "0 auto 24px",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: "#888", fontSize: "14px" }}>Verifying your email…</p>
        </>
      )}

      {state === "success" && (
        <>
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>✅</div>
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
            Email verified!
          </h1>
          <p style={{ color: "#888", fontSize: "14px", lineHeight: 1.6 }}>
            You can close this tab and continue in the other one.
          </p>
        </>
      )}

      {state === "error" && (
        <>
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>❌</div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
            Verification failed
          </h1>
          <p style={{ color: "#888", fontSize: "14px", marginBottom: "24px" }}>
            {errorMsg}
          </p>
          <a
            href="/account"
            style={{
              display: "inline-block",
              background: "#2563eb",
              color: "#fff",
              padding: "10px 24px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Go to account
          </a>
        </>
      )}
    </div>
  );
}

// Outer component — wraps the inner one in Suspense as required by Next.js
// when useSearchParams() is used in a client component
export default function VerifyEmailPage() {
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
      <Suspense fallback={<div>Loading...</div>}>
        <VerifyEmailInner />
      </Suspense>
    </div>
  );
}
