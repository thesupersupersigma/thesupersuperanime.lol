export default function VerifyEmailErrorPage() {
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
        <div style={{ fontSize: "40px", marginBottom: "20px" }}>❌</div>
        <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>
          Verification failed
        </h1>
        <p style={{ color: "#888", fontSize: "14px", lineHeight: 1.6, marginBottom: "28px" }}>
          This verification link is invalid or has expired. Links are only valid for 24 hours.
          You can request a new one from your account page.
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
      </div>
    </div>
  );
}
