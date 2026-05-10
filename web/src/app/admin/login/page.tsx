import type { Metadata } from "next";
import { adminLoginAction } from "./actions";

export const metadata: Metadata = {
  title: "Admin Access — thesupersuperanime",
};

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const { error } = await searchParams;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f0f",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: "320px", padding: "0 16px" }}>
        {/* Title */}
        <p
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "13px",
            fontWeight: 600,
            color: "#888",
            textAlign: "center",
            marginBottom: "20px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Admin Access
        </p>

        {/* Error */}
        {error && (
          <p
            style={{
              color: "#ef4444",
              fontSize: "12px",
              textAlign: "center",
              marginBottom: "12px",
            }}
          >
            Incorrect password.
          </p>
        )}

        {/* Form */}
        <form action={adminLoginAction}>
          <input
            type="password"
            name="password"
            placeholder="Admin password"
            autoFocus
            autoComplete="current-password"
            required
            style={{
              width: "100%",
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: "4px",
              color: "#e5e5e5",
              fontSize: "14px",
              padding: "10px 12px",
              outline: "none",
              marginBottom: "8px",
              fontFamily: "inherit",
            }}
          />
          <button
            type="submit"
            style={{
              width: "100%",
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 600,
              padding: "10px 0",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "background 150ms ease",
            }}
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
