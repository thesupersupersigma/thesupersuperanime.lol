export default function OfflinePage() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "60vh", gap: "16px", textAlign: "center"
    }}>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "24px", fontWeight: 700, color: "#e5e5e5" }}>
        You&apos;re offline
      </h1>
      <p style={{ color: "#555", fontSize: "14px" }}>
        Check your connection and try again.
      </p>
    </div>
  );
}
