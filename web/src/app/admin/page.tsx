import Link from "next/link";
import { db } from "@/lib/db";
import { providers } from "@/providers/index";
import { DashboardClient } from "./components/dashboard-client";
import { IssuesPanel } from "./components/issues-panel";
import { WatchPartiesPanel } from "./components/watch-parties-panel";
import { AnnouncementPanel } from "./components/announcement-panel";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Canary Dashboard — thesupersuperanime",
  robots: { index: false, follow: false },
};

// Always fetch fresh from DB on request — no cache for the admin page
export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const currentUser = await getCurrentUser();
  if (!isAdmin(currentUser?.discordId)) {
    redirect("/");
  }

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

  // Fetch recent issues for the admin panel
  const rawIssues = await db.issue.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: { select: { id: true, discordUsername: true, username: true, email: true } },
    },
  });

  const initialIssues = rawIssues.map((i) => ({
    id: i.id,
    type: i.type,
    description: i.description,
    animeInfo: i.animeInfo,
    status: i.status,
    createdAt: i.createdAt.toISOString(),
    user: i.user
      ? { id: i.user.id, discordUsername: i.user.discordUsername, username: i.user.username, email: i.user.email }
      : null,
  }));

  // Fetch active (non-expired) watch parties for the admin panel
  const rawParties = await db.watchParty.findMany({
    where: { expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      host: { select: { id: true, discordUsername: true, username: true, email: true } },
    },
  });

  const initialParties = rawParties.map((p) => ({
    id: p.id,
    roomCode: p.roomCode,
    animeId: p.animeId,
    episodeNum: p.episodeNum,
    audioType: p.audioType,
    createdAt: p.createdAt.toISOString(),
    expiresAt: p.expiresAt.toISOString(),
    host: p.host
      ? { discordUsername: p.host.discordUsername, username: p.host.username, email: p.host.email }
      : null,
  }));

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
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 24px 24px" }}>
        <Link
          href="/admin/badges"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            borderRadius: "10px",
            padding: "12px 18px",
            color: "#e5e5e5",
            fontSize: "14px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          🏅 Badge Management →
        </Link>
      </div>
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 24px 80px" }}>
        <WatchPartiesPanel initialParties={initialParties} />
      </div>
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 24px 80px" }}>
        <IssuesPanel initialIssues={initialIssues} />
      </div>
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 24px 80px" }}>
        <AnnouncementPanel />
      </div>
    </div>
  );
}
