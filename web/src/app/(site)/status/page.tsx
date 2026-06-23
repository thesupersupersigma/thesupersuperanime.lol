import type { Metadata } from "next";
import { getStatusSnapshot, type StatusService, type ServiceStatus, type OverallStatus } from "@/lib/status";
import { RefreshButton } from "./refresh-button";

export const metadata: Metadata = {
  title: "Status — thesupersuperanime",
  description: "Live uptime and health of thesupersuperanime services.",
};

export const dynamic = "force-dynamic";

// ── Visual constants ──────────────────────────────────────────────────────────

const STATUS_META: Record<ServiceStatus, { label: string; color: string }> = {
  operational: { label: "Operational", color: "#22c55e" },
  degraded: { label: "Degraded", color: "#eab308" },
  outage: { label: "Outage", color: "#ef4444" },
  unknown: { label: "Unknown", color: "#6b7280" },
};

const OVERALL_META: Record<OverallStatus, { label: string; color: string }> = {
  operational: { label: "All Systems Operational", color: "#22c55e" },
  degraded: { label: "Partial Outage", color: "#eab308" },
  outage: { label: "Major Outage", color: "#ef4444" },
};

const CARD: React.CSSProperties = {
  background: "#111",
  border: "1px solid #2a2a2a",
  borderRadius: "12px",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── Sub-components (server-rendered, no client JS) ────────────────────────────

function StatusBadge({ status }: { status: ServiceStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 700,
        color: meta.color,
        background: `${meta.color}18`,
        border: `1px solid ${meta.color}40`,
        padding: "2px 9px",
        borderRadius: "999px",
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

// 90 tiny bars, oldest → newest. Pure divs — green/red/grey, no JS.
function Sparkline({ history }: { history: (boolean | null)[] }) {
  return (
    <div style={{ display: "flex", gap: "2px", alignItems: "flex-end" }}>
      {history.map((h, i) => (
        <div
          key={i}
          title={h === null ? "No data" : h ? "Up" : "Down"}
          style={{
            width: "4px",
            height: "16px",
            borderRadius: "1px",
            background: h === null ? "#262626" : h ? "#22c55e" : "#ef4444",
          }}
        />
      ))}
    </div>
  );
}

function ServiceRow({ service }: { service: StatusService }) {
  return (
    <div
      style={{
        padding: "16px 18px",
        borderTop: "1px solid #1c1c1c",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "14px", color: "#e5e5e5", fontWeight: 500, flex: "1 1 auto" }}>
          {service.name}
        </span>
        {service.latencyMs != null && (
          <span style={{ fontSize: "12px", color: "#666" }}>{service.latencyMs}ms</span>
        )}
        <StatusBadge status={service.status} />
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <Sparkline history={service.history} />
        <span style={{ fontSize: "11px", color: "#555", whiteSpace: "nowrap" }}>
          {service.uptimePercent}% uptime · last 90 checks
        </span>
      </div>
    </div>
  );
}

function ServiceGroupCard({ title, services }: { title: string; services: StatusService[] }) {
  return (
    <section style={{ ...CARD, overflow: "hidden", marginBottom: "20px" }}>
      <h2
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "15px",
          fontWeight: 600,
          color: "#e5e5e5",
          margin: 0,
          padding: "14px 18px",
        }}
      >
        {title}
      </h2>
      {services.length === 0 ? (
        <div style={{ padding: "16px 18px", borderTop: "1px solid #1c1c1c", color: "#555", fontSize: "13px" }}>
          No services reporting yet.
        </div>
      ) : (
        services.map((s) => <ServiceRow key={s.id} service={s} />)
      )}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StatusPage() {
  const data = await getStatusSnapshot();

  const infra = data.services.filter((s) => s.group === "infrastructure");
  const providers = data.services.filter((s) => s.group === "providers");
  const activeIncidents = data.services.filter((s) => s.incident);

  const overall = OVERALL_META[data.overallStatus];

  // Response-time chart: longest latency = full-width bar, others proportional.
  const withLatency = data.services.filter((s) => s.latencyMs != null);
  const maxLatency = Math.max(1, ...withLatency.map((s) => s.latencyMs!));

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 24px 80px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "16px" }}>
        <h1
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "30px",
            fontWeight: 700,
            color: "#e5e5e5",
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          Service Status
        </h1>
        <RefreshButton lastUpdated={data.lastUpdated} />
      </div>

      {/* Heads-up note */}
      <div
        style={{
          ...CARD,
          borderColor: "rgba(59, 130, 246, 0.35)",
          background: "rgba(59, 130, 246, 0.06)",
          padding: "12px 16px",
          marginBottom: "24px",
          fontSize: "13px",
          color: "#9db8e8",
          lineHeight: 1.6,
        }}
      >
        ⚠️ Heads up — this page will 100% change. I&apos;m swapping scrapers once I finish
        building my own, and a reconsumet API is coming soon. Expect the services listed
        below to shift around.
      </div>

      {/* Overall banner */}
      <div
        style={{
          ...CARD,
          padding: "20px 24px",
          marginBottom: "28px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          borderColor: `${overall.color}55`,
          background: `${overall.color}10`,
        }}
      >
        <span
          style={{
            width: "14px",
            height: "14px",
            borderRadius: "999px",
            background: overall.color,
            boxShadow: `0 0 12px ${overall.color}`,
            flexShrink: 0,
          }}
        />
        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: "22px", fontWeight: 700, color: "#e5e5e5" }}>
          {overall.label}
        </span>
      </div>

      {/* Active incidents */}
      {activeIncidents.length > 0 && (
        <section style={{ marginBottom: "28px" }}>
          <h2
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: "16px",
              fontWeight: 600,
              color: "#ef4444",
              marginBottom: "12px",
            }}
          >
            Active Incidents
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {activeIncidents.map((s) => (
              <div
                key={s.id}
                style={{
                  ...CARD,
                  borderLeft: "3px solid #ef4444",
                  padding: "14px 18px",
                }}
              >
                <div style={{ fontSize: "14px", color: "#e5e5e5", fontWeight: 600, marginBottom: "4px" }}>
                  {s.name}
                </div>
                <div style={{ fontSize: "12px", color: "#888", marginBottom: "6px" }}>
                  Since {formatTime(s.incident!.startedAt)}
                </div>
                <div style={{ fontSize: "13px", color: "#bbb", lineHeight: 1.6 }}>
                  {s.incident!.description || "Service is currently experiencing an outage."}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Service groups */}
      <ServiceGroupCard title="Infrastructure" services={infra} />
      <ServiceGroupCard title="Stream Providers" services={providers} />

      {/* Response time chart */}
      {withLatency.length > 0 && (
        <section style={{ ...CARD, padding: "18px", marginTop: "8px" }}>
          <h2
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: "15px",
              fontWeight: 600,
              color: "#e5e5e5",
              margin: "0 0 16px",
            }}
          >
            Response Times
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {withLatency.map((s) => {
              const pct = Math.max(2, Math.round((s.latencyMs! / maxLatency) * 100));
              const meta = STATUS_META[s.status];
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "12px", color: "#999", width: "150px", flexShrink: 0 }}>
                    {s.name}
                  </span>
                  <div style={{ flex: 1, height: "10px", background: "#1a1a1a", borderRadius: "5px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: meta.color,
                        borderRadius: "5px",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: "12px", color: "#777", width: "60px", textAlign: "right", flexShrink: 0 }}>
                    {s.latencyMs}ms
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p style={{ textAlign: "center", fontSize: "11px", color: "#444", marginTop: "28px" }}>
        Last updated {formatTime(data.lastUpdated)} · auto-refreshes every 60s
      </p>
    </div>
  );
}
