"use client";
import { useState, useEffect, useRef, startTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ImportButton, SignOutButton, UnlinkDiscordButton, DeleteAccountButton, AniListConnectButton } from "./account-buttons";
import { unlinkDiscordAction, deleteAccountAction, updateProfileAction } from "./actions";
import { getUserAvatar, getUserDisplayName } from "@/lib/user-utils";
import { BadgeCard } from "@/components/badges/BadgeCard";

interface HistoryEntry { episodeId: string; animeId: number; progress: number; duration: number; updatedAt: string; title: string; cover: string; }
interface WatchlistEntry { animeId: number; status: string; addedAt: string; title: string; cover: string; }
interface BadgeEntry { slug: string; name: string; description: string; icon: string; rarity: string; rarityOrder: number; grantedAt: string; context?: string | null; }
interface NotifPrefs {
  emailNotifStreak: boolean;
  emailNotifRanked: boolean;
  emailNotifNewEpisode: boolean;
  emailNotifCompletion: boolean;
}
interface Props {
  user: {
    id: string;
    email: string;
    discordId?: string | null;
    discordUsername?: string | null;
    discordAvatar?: string | null;
    avatarPreset?: number | null;
    username?: string | null;
    displayName?: string | null;
    anilistUsername?: string | null;
  };
  notifPrefs: NotifPrefs;
  history: HistoryEntry[];
  watchlist: WatchlistEntry[];
  badges: BadgeEntry[];
  logOutAction: () => Promise<void>;
}
type Tab = "history" | "watchlist" | "badges" | "import" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "history", label: "History" },
  { id: "watchlist", label: "Watchlist" },
  { id: "badges", label: "Badges" },
  { id: "import", label: "Import" },
  { id: "settings", label: "Settings" },
];

const STATUS_COLORS: Record<string, string> = { Watching: "#3b82f6", Completed: "#22c55e", Planning: "#a855f7", Dropped: "#ef4444", Paused: "#f59e0b", }; 

function formatProgress(progress: number, duration: number): string { 
  if (!duration) return `${Math.floor(progress / 60)}m watched`; 
  const pct = Math.round((progress / duration) * 100); 
  return `${pct}%`; 
} 

function timeAgo(isoString: string): string { 
  const diff = Date.now() - new Date(isoString).getTime(); 
  const mins = Math.floor(diff / 60000); 
  if (mins < 60) return `${mins}m ago`; 
  const hrs = Math.floor(mins / 60); 
  if (hrs < 24) return `${hrs}h ago`; 
  const days = Math.floor(hrs / 24); 
  return `${days}d ago`; 
} 

export function AccountDashboard({ user, notifPrefs, history, watchlist, badges, logOutAction }: Props) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>("history");
  const [discordUsername, setDiscordUsername] = useState<string | null | undefined>(user.discordUsername);
  const [anilistUsername, setAnilistUsername] = useState<string | null | undefined>(user.anilistUsername);

  useEffect(() => {
    const tab = searchParams.get("tab") as Tab | null;
    if (tab && TABS.find(t => t.id === tab)) {
      startTransition(() => { setActiveTab(tab); });
    }
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setDiscordUsername(data.discordUsername);
          if ("anilistUsername" in data) setAnilistUsername(data.anilistUsername);
        }
      })
      .catch(() => {});
  }, []);

  return ( 
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e5e5e5", paddingTop: "80px", paddingBottom: "80px", paddingLeft: "24px", paddingRight: "24px", }}> 
      <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}> 
        {/* Back to home */} 
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#555", fontSize: "13px", textDecoration: "none", width: "fit-content", }} onMouseEnter={e => (e.currentTarget.style.color = "#a3a3a3")} onMouseLeave={e => (e.currentTarget.style.color = "#555")} > 
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> <path d="M19 12H5M12 5l-7 7 7 7" /> </svg> 
          Back to home 
        </Link> 

        {/* Header */} 
        <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: "16px", padding: "28px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", position: "relative", overflow: "hidden", }}> 
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "1px", background: "linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)", }} /> 
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <Image
              src={getUserAvatar(user)}
              alt={getUserDisplayName(user)}
              width={44}
              height={44}
              style={{ borderRadius: "50%", border: "1px solid #2a2a2a", flexShrink: 0, objectFit: "cover" }}
            />
            <div>
              <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "18px", fontWeight: 700, color: "#e5e5e5", letterSpacing: "-0.02em", marginBottom: "3px" }}>
                {getUserDisplayName(user)}
              </h1>
              <p style={{ color: "#555", fontSize: "12px" }}>{user.email}</p>
            </div>
          </div> 
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}> 
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}> 
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px rgba(34,197,94,0.7)", }} /> 
              <span style={{ color: "#555", fontSize: "12px" }}>Synced</span> 
            </div> 
            <SignOutButton action={logOutAction} /> 
          </div> 
        </div> 

        {/* Stats row */} 
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}> 
          {[ 
            { label: "Episodes Watched", value: history.length }, 
            { label: "In Watchlist", value: watchlist.length }, 
            { label: "Completed", value: watchlist.filter(w => w.status === "Completed").length }, 
          ].map(stat => ( 
            <div key={stat.label} style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: "12px", padding: "20px", textAlign: "center", }}> 
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: "28px", fontWeight: 700, color: "#e5e5e5", marginBottom: "4px", }}> {stat.value} </div> 
              <div style={{ color: "#555", fontSize: "12px" }}>{stat.label}</div> 
            </div> 
          ))} 
        </div> 

        {/* Tabs */} 
        <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: "16px", overflow: "hidden", }}> 
          {/* Tab bar */} 
          <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a", }}> 
            {TABS.map(tab => ( 
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: "16px", background: "none", border: "none", borderBottom: activeTab === tab.id ? "2px solid #3b82f6" : "2px solid transparent", color: activeTab === tab.id ? "#e5e5e5" : "#555", fontSize: "13px", fontWeight: 600, cursor: "pointer", transition: "color 0.15s", marginBottom: "-1px", }} onMouseEnter={e => { if (activeTab !== tab.id) e.currentTarget.style.color = "#a3a3a3" }} onMouseLeave={e => { if (activeTab !== tab.id) e.currentTarget.style.color = "#555" }} > 
                {tab.label} 
              </button> 
            ))} 
          </div> 

          {/* Tab content */} 
          <div style={{ padding: "24px" }}> 
            {/* HISTORY TAB */}
            {activeTab === "history" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "4px" }}>
                  <ExportHistoryButton />
                </div>
                {history.length === 0 ? (
                  <EmptyState message="No watch history yet. Start watching something!" /> 
                ) : ( 
                  history.map(entry => { 
                    const [animeId, epNum] = entry.episodeId.split("-") 
                    return ( 
                      <Link key={entry.episodeId} href={`/watch/${animeId}/${epNum}`} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px", borderRadius: "10px", background: "#0f0f0f", border: "1px solid #1a1a1a", textDecoration: "none", transition: "border-color 0.15s", }} onMouseEnter={e => (e.currentTarget.style.borderColor = "#2a2a2a")} onMouseLeave={e => (e.currentTarget.style.borderColor = "#1a1a1a")} > 
                        {entry.cover ? ( 
                          <Image src={entry.cover} alt={entry.title} width={40} height={56} style={{ borderRadius: "6px", objectFit: "cover", flexShrink: 0 }} /> 
                        ) : ( 
                          <div style={{ width: 40, height: 56, borderRadius: "6px", background: "#1a1a1a", flexShrink: 0 }} /> 
                        )} 
                        <div style={{ flex: 1, minWidth: 0 }}> 
                          <div style={{ color: "#e5e5e5", fontSize: "13px", fontWeight: 600, marginBottom: "3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", }}> {entry.title} </div> 
                          <div style={{ color: "#555", fontSize: "12px" }}> Episode {epNum} </div> 
                        </div> 
                        <div style={{ textAlign: "right", flexShrink: 0 }}> 
                          <div style={{ color: "#3b82f6", fontSize: "12px", fontWeight: 600, marginBottom: "2px" }}> {formatProgress(entry.progress, entry.duration)} </div> 
                          <div style={{ color: "#444", fontSize: "11px" }}> {timeAgo(entry.updatedAt)} </div> 
                        </div> 
                      </Link> 
                    ) 
                  }) 
                )} 
              </div> 
            )} 

            {/* WATCHLIST TAB */} 
            {activeTab === "watchlist" && ( 
              <div> 
                {watchlist.length === 0 ? ( 
                  <EmptyState message="Your watchlist is empty. Add anime from their detail pages." /> 
                ) : ( 
                  <> 
                    {/* Group by status */} 
                    {(["Watching", "Planning", "Completed", "Paused", "Dropped"] as const).map(status => { 
                      const group = watchlist.filter(w => w.status === status) 
                      if (group.length === 0) return null 
                      return ( 
                        <div key={status} style={{ marginBottom: "24px" }}> 
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", }}> 
                            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: STATUS_COLORS[status] ?? "#555", }} /> 
                            <span style={{ color: "#a3a3a3", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}> {status} ({group.length}) </span> 
                          </div> 
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "10px" }}> 
                            {group.map(entry => ( 
                              <Link key={entry.animeId} href={`/anime/${entry.animeId}`} style={{ textDecoration: "none" }} > 
                                <div style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid #1a1a1a", transition: "border-color 0.15s", }} onMouseEnter={e => (e.currentTarget.style.borderColor = "#2a2a2a")} onMouseLeave={e => (e.currentTarget.style.borderColor = "#1a1a1a")} > 
                                  {entry.cover ? ( 
                                    <Image src={entry.cover} alt={entry.title} width={120} height={170} style={{ width: "100%", height: "auto", display: "block", objectFit: "cover" }} /> 
                                  ) : ( 
                                    <div style={{ width: "100%", paddingTop: "140%", background: "#1a1a1a" }} /> 
                                  )} 
                                  <div style={{ padding: "8px", background: "#0f0f0f" }}> 
                                    <div style={{ color: "#e5e5e5", fontSize: "11px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", }}> {entry.title} </div> 
                                  </div> 
                                </div> 
                              </Link> 
                            ))} 
                          </div> 
                        </div> 
                      ) 
                    })} 
                  </> 
                )} 
              </div> 
            )} 

            {/* BADGES TAB */}
            {activeTab === "badges" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {(user.username || user.discordUsername) && (
                  <Link
                    href={`/user/${user.username ?? user.discordUsername}`}
                    style={{
                      alignSelf: "flex-end",
                      color: "#3b82f6",
                      fontSize: "13px",
                      textDecoration: "none",
                    }}
                  >
                    View public profile →
                  </Link>
                )}
                {badges.length === 0 ? (
                  <EmptyState message="No badges yet. Keep watching to earn some!" />
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {badges.map((badge, i) => (
                      <BadgeCard
                        key={badge.slug + (badge.context ?? "")}
                        slug={badge.slug}
                        name={badge.name}
                        description={badge.description}
                        icon={badge.icon}
                        rarity={badge.rarity}
                        rarityOrder={badge.rarityOrder}
                        grantedAt={badge.grantedAt}
                        context={badge.context}
                        index={i}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* IMPORT TAB */}
            {activeTab === "import" && (
              <div style={{ maxWidth: "480px" }}>
                <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5", marginBottom: "8px", }}> Import from another site </h3>
                <p style={{ color: "#555", fontSize: "13px", lineHeight: "1.6", marginBottom: "20px" }}> Upload an export file from AniKai or HiAnime to restore your watchlist and history. Supports .json, .txt, and .xml formats. </p>
                <ImportButton />
                {anilistUsername && (
                  <>
                    <div style={{ height: "1px", background: "#1a1a1a", margin: "24px 0" }} />
                    <AniListImportSection />
                  </>
                )}
              </div>
            )} 

            {/* SETTINGS TAB */}
            {activeTab === "settings" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "480px" }}>
                <div>
                  <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5", marginBottom: "8px" }}> Account </h3>
                  <p style={{ color: "#555", fontSize: "13px", marginBottom: "16px" }}> Signed in as <span style={{ color: "#a3a3a3" }}>{user.email}</span> </p>
                  <SignOutButton action={logOutAction} />
                </div>

                {/* Profile editor — email-only users only */}
                {!user.discordId && (
                  <>
                    <div style={{ height: "1px", background: "#1a1a1a" }} />
                    <ProfileEditor user={user} />
                  </>
                )}

                <div style={{ height: "1px", background: "#1a1a1a" }} />
                <div>
                  <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5", marginBottom: "8px" }}> Password </h3>
                  <p style={{ color: "#555", fontSize: "13px", marginBottom: "16px" }}> To change your password, sign out and use the &quot;Forgot password?&quot; link on the login screen. </p>
                </div> 
                <div style={{ height: "1px", background: "#1a1a1a" }} /> 
                <div> 
                  <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5", marginBottom: "8px", }}> Discord </h3> 
                  {discordUsername ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                      <p style={{ color: "#555", fontSize: "13px" }}> Linked as <span style={{ color: "#5865F2", fontWeight: 600 }}> {discordUsername} </span> </p>
                      <UnlinkDiscordButton action={unlinkDiscordAction} />
                    </div>
                  ) : (
                    <div>
                      <p style={{ color: "#555", fontSize: "13px", marginBottom: "12px" }}>No Discord account linked.</p>
                      <a
                        href="/account/link-discord"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: "8px",
                          background: "#5865F2", color: "#fff", border: "none",
                          borderRadius: "8px", padding: "9px 16px",
                          fontSize: "13px", fontWeight: 600, textDecoration: "none",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#4752c4")}
                        onMouseLeave={e => (e.currentTarget.style.background = "#5865F2")}
                      >
                        {/* Discord icon */}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                        </svg>
                        Link Discord
                      </a>
                      <p style={{ color: "#444", fontSize: "12px", marginTop: "8px", lineHeight: "1.5" }}>
                        Linking Discord gives you a Discord avatar and username automatically.
                      </p>
                    </div>
                  )}
                </div>

                <div style={{ height: "1px", background: "#1a1a1a" }} />
                <div>
                  <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5", marginBottom: "8px" }}>
                    AniList
                  </h3>
                  {anilistUsername ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                      <p style={{ color: "#555", fontSize: "13px" }}>
                        Linked as <span style={{ color: "#02a9ff", fontWeight: 600 }}>{anilistUsername}</span>
                      </p>
                      <button
                        onClick={async () => {
                          if (!confirm("Unlink your AniList account?")) return;
                          await fetch("/api/auth/anilist/unlink", { method: "POST" });
                          setAnilistUsername(null);
                        }}
                        style={{
                          background: "rgba(2,169,255,0.08)", border: "1px solid rgba(2,169,255,0.2)",
                          color: "#38bdf8", padding: "8px 16px", borderRadius: "8px",
                          fontWeight: 600, fontSize: "12px", cursor: "pointer", whiteSpace: "nowrap",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(2,169,255,0.15)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "rgba(2,169,255,0.08)")}
                      >
                        Unlink
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p style={{ color: "#555", fontSize: "13px", marginBottom: "12px" }}>No AniList account linked.</p>
                      <AniListConnectButton userId={user.id} />
                      <p style={{ color: "#444", fontSize: "12px", marginTop: "8px", lineHeight: "1.5" }}>
                        Link your AniList account to sync your watch progress and import your list.
                      </p>
                    </div>
                  )}
                </div>

                <div style={{ height: "1px", background: "#1a1a1a" }} />
                <NotificationSettings notifPrefs={notifPrefs} />

                <div style={{ height: "1px", background: "#1a1a1a" }} />
                <div>
                  <h3 style={{
                    fontFamily: "'Syne', sans-serif", fontSize: "15px",
                    fontWeight: 600, color: "#ef4444", marginBottom: "8px",
                  }}>
                    Danger Zone
                  </h3>
                  <p style={{ color: "#555", fontSize: "13px", marginBottom: "16px" }}>
                    Permanently delete your account and all associated data.
                  </p>
                  <DeleteAccountButton action={deleteAccountAction} />
                </div>
              </div> 
            )} 
          </div> 
        </div> 
      </div> 
    </div> 
  ); 
} 

function AniListImportSection() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/anilist/sync/import", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Import failed");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5", marginBottom: "8px" }}>
        Import from AniList
      </h3>
      <p style={{ color: "#555", fontSize: "13px", lineHeight: "1.6", marginBottom: "16px" }}>
        Sync your AniList anime list to your watchlist here.
      </p>
      <button
        onClick={handleImport}
        disabled={loading}
        style={{
          background: loading ? "#082f49" : "#0369a1",
          color: "#e0f2fe",
          border: "none",
          borderRadius: "8px",
          padding: "9px 18px",
          fontSize: "13px",
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
        onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "#0284c7"; }}
        onMouseLeave={e => { if (!loading) e.currentTarget.style.background = "#0369a1"; }}
      >
        {loading ? "Importing…" : "Import from AniList"}
      </button>
      {result && (
        <p style={{ color: "#22c55e", fontSize: "13px", marginTop: "10px" }}>
          {result.imported} imported, {result.skipped} skipped.
        </p>
      )}
      {error && (
        <p style={{ color: "#f87171", fontSize: "13px", marginTop: "10px" }}>{error}</p>
      )}
    </div>
  );
}

// ── Email notification toggles ────────────────────────────────────────────

const NOTIF_TOGGLES: { field: keyof NotifPrefs; label: string }[] = [
  { field: "emailNotifStreak", label: "Streak at risk" },
  { field: "emailNotifRanked", label: "Leaderboard rank change" },
  { field: "emailNotifNewEpisode", label: "New episode available" },
  { field: "emailNotifCompletion", label: "Completion milestone" },
];

function NotificationSettings({ notifPrefs }: { notifPrefs: NotifPrefs }) {
  const [prefs, setPrefs] = useState(notifPrefs);

  async function handleToggle(field: keyof NotifPrefs) {
    const value = !prefs[field];
    setPrefs(p => ({ ...p, [field]: value }));
    try {
      const res = await fetch("/api/account/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revert on failure
      setPrefs(p => ({ ...p, [field]: !value }));
    }
  }

  return (
    <div>
      <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5", marginBottom: "12px" }}>
        Email Notifications
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {NOTIF_TOGGLES.map(({ field, label }) => (
          <div key={field} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <span style={{ color: "#a3a3a3", fontSize: "13px" }}>{label}</span>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[field]}
              onClick={() => handleToggle(field)}
              style={{
                width: "40px",
                height: "22px",
                borderRadius: "11px",
                border: "none",
                padding: "2px",
                background: prefs[field] ? "#2563eb" : "#2a2a2a",
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 0.15s",
                display: "flex",
                justifyContent: prefs[field] ? "flex-end" : "flex-start",
              }}
            >
              <div style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: "#fff",
              }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExportHistoryButton() {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/export/watch-history");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "watch-history.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Silent failure — keep the button available to retry
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={busy}
      style={{
        border: "1px solid #2a2a2a",
        background: "none",
        color: "#555",
        fontSize: "12px",
        padding: "6px 12px",
        borderRadius: "6px",
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
        transition: "color 0.15s, border-color 0.15s",
      }}
      onMouseEnter={e => { if (!busy) { e.currentTarget.style.color = "#a3a3a3"; e.currentTarget.style.borderColor = "#3a3a3a"; } }}
      onMouseLeave={e => { e.currentTarget.style.color = "#555"; e.currentTarget.style.borderColor = "#2a2a2a"; }}
    >
      {busy ? "Exporting…" : "Export CSV"}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center", color: "#444", fontSize: "13px" }}>
      {message}
    </div>
  );
}

// ── Profile editor (email-only users) ─────────────────────────────────────────

interface ProfileEditorProps {
  user: {
    avatarPreset?: number | null;
    username?: string | null;
    displayName?: string | null;
  };
}

function AvatarPicker({ selected, onSelect }: { selected: number; onSelect: (n: number) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "8px" }}>
      {Array.from({ length: 14 }, (_, i) => i + 1).map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onSelect(n)}
          title={`Avatar ${n}`}
          style={{
            padding: 0,
            background: "none",
            border: `2px solid ${selected === n ? "#3b82f6" : "transparent"}`,
            borderRadius: "50%",
            cursor: "pointer",
            outline: selected === n ? "none" : undefined,
            transition: "border-color 0.15s",
            overflow: "hidden",
            width: 44,
            height: 44,
            flexShrink: 0,
          }}
          onMouseEnter={e => { if (selected !== n) e.currentTarget.style.borderColor = "#2a2a2a"; }}
          onMouseLeave={e => { if (selected !== n) e.currentTarget.style.borderColor = "transparent"; }}
        >
          <Image
            src={`/avatars/PP_${n}.png`}
            alt={`Avatar ${n}`}
            width={44}
            height={44}
            style={{ borderRadius: "50%", display: "block", objectFit: "cover" }}
          />
        </button>
      ))}
    </div>
  );
}

function ProfileEditor({ user }: ProfileEditorProps) {
  const [username, setUsername] = useState(user.username ?? "");
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [avatarPreset, setAvatarPreset] = useState(user.avatarPreset ?? 1);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok?: true; error?: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setResult(null);
    const fd = new FormData(formRef.current!);
    fd.set("avatarPreset", String(avatarPreset));
    const res = await updateProfileAction(fd);
    setSaving(false);
    if ("success" in res && res.success) {
      setResult({ ok: true });
    } else {
      setResult({ error: "error" in res ? (res.error ?? "Something went wrong.") : "Something went wrong." });
    }
  }

  return (
    <div>
      <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5", marginBottom: "16px" }}>
        Profile
      </h3>
      <form ref={formRef} onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Avatar picker */}
        <div>
          <label style={{ display: "block", fontSize: "12px", color: "#666", marginBottom: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Avatar
          </label>
          <AvatarPicker selected={avatarPreset} onSelect={setAvatarPreset} />
          <input type="hidden" name="avatarPreset" value={avatarPreset} />
        </div>

        {/* Username */}
        <div>
          <label style={{ display: "block", fontSize: "12px", color: "#666", marginBottom: "6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Username
          </label>
          <input
            type="text"
            name="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="e.g. animefan99"
            maxLength={30}
            style={{
              width: "100%", background: "#0f0f0f", border: "1px solid #2a2a2a",
              borderRadius: "8px", padding: "9px 12px", color: "#e5e5e5",
              fontSize: "13px", outline: "none", boxSizing: "border-box",
            }}
            onFocus={e => (e.target.style.borderColor = "#3b82f6")}
            onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
          />
          <p style={{ color: "#444", fontSize: "11px", marginTop: "4px" }}>
            3–30 chars, letters/numbers/_ or - only. Used in your public profile URL.
          </p>
        </div>

        {/* Display name */}
        <div>
          <label style={{ display: "block", fontSize: "12px", color: "#666", marginBottom: "6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Display Name
          </label>
          <input
            type="text"
            name="displayName"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Shown on comments and leaderboard"
            maxLength={50}
            style={{
              width: "100%", background: "#0f0f0f", border: "1px solid #2a2a2a",
              borderRadius: "8px", padding: "9px 12px", color: "#e5e5e5",
              fontSize: "13px", outline: "none", boxSizing: "border-box",
            }}
            onFocus={e => (e.target.style.borderColor = "#3b82f6")}
            onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
          />
          <p style={{ color: "#444", fontSize: "11px", marginTop: "4px" }}>
            Shown everywhere your name appears. Falls back to your username, then email prefix.
          </p>
        </div>

        {/* Result feedback */}
        {result?.error && (
          <p style={{ color: "#f87171", fontSize: "13px", margin: 0 }}>{result.error}</p>
        )}
        {result?.ok && (
          <p style={{ color: "#22c55e", fontSize: "13px", margin: 0 }}>Profile saved!</p>
        )}

        <div>
          <button
            type="submit"
            disabled={saving}
            style={{
              background: saving ? "#1e3a8a" : "#2563eb",
              color: "#fff", border: "none", borderRadius: "8px",
              padding: "10px 24px", fontSize: "13px", fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </form>
    </div>
  );
}