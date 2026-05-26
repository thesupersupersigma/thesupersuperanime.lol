"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { verifyEmailAction } from "@/app/account/actions";

type State = "loading" | "success" | "error";

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const router = useRouter();
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
        // Redirect after a brief success message so the user sees feedback
        setTimeout(() => router.replace("/account?verified=1"), 2000);
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
            <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
              Email verified!
            </h1>
            <p style={{ color: "#888", fontSize: "14px" }}>
              You&apos;re all set. Redirecting you to your account…
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
    </div>
  );
}
