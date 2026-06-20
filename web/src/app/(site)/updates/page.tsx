import type { Metadata } from "next";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Updates — thesupersuperanime",
};

export const dynamic = "force-dynamic";

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function UpdatesPage() {
  const entries = await db.changelog.findMany({
    orderBy: { publishedAt: "desc" },
    take: 50,
  });

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "48px 24px 80px" }}>
      <h1
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "32px",
          fontWeight: 700,
          color: "#e5e5e5",
          letterSpacing: "-0.02em",
          marginBottom: "8px",
        }}
      >
        Updates
      </h1>
      <p style={{ color: "#525252", fontSize: "14px", marginBottom: "40px" }}>
        What&apos;s new on thesupersuperanime
      </p>

      {entries.length === 0 ? (
        <div
          style={{
            padding: "48px",
            textAlign: "center",
            color: "#444",
            fontSize: "13px",
            background: "#111",
            border: "1px solid #2a2a2a",
            borderRadius: "12px",
          }}
        >
          No updates yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                background: "#111",
                border: entry.major ? "1px solid rgba(59, 130, 246, 0.4)" : "1px solid #2a2a2a",
                borderRadius: "12px",
                padding: "20px 24px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "6px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: entry.major ? "#3b82f6" : "#888",
                    background: entry.major ? "#3b82f618" : "#1a1a1a",
                    border: `1px solid ${entry.major ? "#3b82f630" : "#2a2a2a"}`,
                    padding: "2px 8px",
                    borderRadius: "999px",
                  }}
                >
                  v{entry.version}
                </span>
                <h2
                  style={{
                    fontFamily: "'Syne', sans-serif",
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "#e5e5e5",
                    margin: 0,
                  }}
                >
                  {entry.title}
                </h2>
              </div>
              <p style={{ fontSize: "12px", color: "#525252", margin: "0 0 12px" }}>
                {formatDate(entry.publishedAt)}
              </p>
              <p
                style={{
                  fontSize: "13px",
                  color: "#aaa",
                  lineHeight: "1.7",
                  whiteSpace: "pre-wrap",
                  margin: 0,
                }}
              >
                {entry.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
