import { db } from "@/lib/db";
import { providers } from "@/providers/index";
import { DashboardClient } from "./components/dashboard-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Canary Dashboard — thesupersuperanime",
  robots: { index: false, follow: false },
};

// Always fetch fresh from DB on request — no cache for the admin page
export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  // Fetch all stored provider statuses from DB
  const dbStatuses = await db.providerStatus.findMany();
  const statusMap = new Map(dbStatuses.map((s) => [s.providerId, s]));

  // Build initial provider state for the client component
  // Include all registered providers, even ones not yet in the DB
  const initialProviders = providers.map((provider) => {
    const s = statusMap.get(provider.id);
    return {
      providerId: provider.id,
      displayName: provider.displayName,
      status: s?.status ?? "unknown",
      latencyMs: s?.latencyMs ?? null,
      lastSuccessAt: s?.lastSuccessAt?.toISOString() ?? null,
      consecutiveFails: s?.consecutiveFails ?? 0,
      lastCheckedAt: s?.lastCheckedAt?.toISOString() ?? null,
    };
  });

  // Most recent check timestamp across all providers
  const mostRecentCheck = dbStatuses
    .filter((s) => s.lastCheckedAt != null)
    .sort(
      (a, b) =>
        new Date(b.lastCheckedAt!).getTime() -
        new Date(a.lastCheckedAt!).getTime()
    )[0]?.lastCheckedAt?.toISOString() ?? null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f0f",
        color: "#e5e5e5",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <DashboardClient
        initialProviders={initialProviders}
        initialLastChecked={mostRecentCheck}
      />
    </div>
  );
}
