"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f0f0f",
      }}
    >
      <form
        action={formAction}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          width: "100%",
          maxWidth: "320px",
          padding: "0 16px",
        }}
      >
        <h1
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "18px",
            fontWeight: 600,
            color: "#e5e5e5",
            marginBottom: "8px",
          }}
        >
          thesupersuperanime will be down for a bit. im working on making the site 100x better while its down. if you REALLY want acess to the site dm thesuper2sigma on discord
        </h1>

        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          disabled={isPending}
          style={{
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            borderRadius: "6px",
            padding: "10px 12px",
            color: "#e5e5e5",
            fontSize: "14px",
            fontFamily: "'DM Sans', sans-serif",
            outline: "none",
            width: "100%",
            transition: "border-color 150ms ease",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "#3b82f6";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "#2a2a2a";
          }}
        />

        <button
          type="submit"
          disabled={isPending}
          style={{
            background: "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            padding: "10px 0",
            fontSize: "14px",
            fontWeight: 500,
            fontFamily: "'DM Sans', sans-serif",
            cursor: isPending ? "not-allowed" : "pointer",
            opacity: isPending ? 0.6 : 1,
            transition: "opacity 150ms ease",
          }}
        >
          {isPending ? "..." : "Enter"}
        </button>

        {state?.error && (
          <p
            style={{
              color: "#ef4444",
              fontSize: "13px",
              textAlign: "center",
            }}
          >
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}
