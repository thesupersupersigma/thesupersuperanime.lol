"use client"; 
import { useState, useEffect } from "react"; 
import { useSearchParams } from "next/navigation"; 
import Link from "next/link"; 
import Image from "next/image"; 
import { ImportButton, SignOutButton, UnlinkDiscordButton, DeleteAccountButton } from "./account-buttons"; 
import { unlinkDiscordAction, deleteAccountAction } from "./actions"; 

interface HistoryEntry { episodeId: string; animeId: number; progress: number; duration: number; updatedAt: string; title: string; cover: string; } 
interface WatchlistEntry { animeId: number; status: string; addedAt: string; title: string; cover: string; } 
interface Props { user: { id: string; email: string; discordUsername?: string | null }; history: HistoryEntry[]; watchlist: WatchlistEntry[]; logOutAction: () => Promise<void>; } 
type Tab = "history" | "watchlist" | "import" | "settings"; 

const TABS: { id: Tab; label: string }[] = [ 
  { id: "history", label: "History" }, 
  { id: "watchlist", label: "Watchlist" }, 
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

export function AccountDashboard({ user, history, watchlist, logOutAction }: Props) { 
  const searchParams = useSearchParams(); 
  const [activeTab, setActiveTab] = useState<Tab>("history"); 

  useEffect(() => { 
    const tab = searchParams.get("tab") as Tab | null; 
    if (tab && TABS.find(t => t.id === tab)) { setActiveTab(tab); } 
  }, [searchParams]); 

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
            {/* Avatar placeholder */} 
            <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "#1a1a1a", border: "1px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: 700, color: "#3b82f6", fontFamily: "'Syne', sans-serif", }}> 
              {user.email[0].toUpperCase()} 
            </div> 
            <div> 
              <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "18px", fontWeight: 700, color: "#e5e5e5", letterSpacing: "-0.02em", marginBottom: "3px", }}> My Account </h1> 
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

            {/* IMPORT TAB */} 
            {activeTab === "import" && ( 
              <div style={{ maxWidth: "480px" }}> 
                <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5", marginBottom: "8px", }}> Import from another site </h3> 
                <p style={{ color: "#555", fontSize: "13px", lineHeight: "1.6", marginBottom: "20px" }}> Upload an export file from AniKai or HiAnime to restore your watchlist and history. Supports .json, .txt, and .xml formats. </p> 
                <ImportButton /> 
              </div> 
            )} 

            {/* SETTINGS TAB */} 
            {activeTab === "settings" && ( 
              <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "480px" }}> 
                <div> 
                  <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5", marginBottom: "8px", }}> Account </h3> 
                  <p style={{ color: "#555", fontSize: "13px", marginBottom: "16px" }}> Signed in as <span style={{ color: "#a3a3a3" }}>{user.email}</span> </p> 
                  <SignOutButton action={logOutAction} /> 
                </div> 
                <div style={{ height: "1px", background: "#1a1a1a" }} /> 
                <div> 
                  <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5", marginBottom: "8px", }}> Password </h3> 
                  <p style={{ color: "#555", fontSize: "13px", marginBottom: "16px" }}> To change your password, sign out and use the "Forgot password?" link on the login screen. </p> 
                </div> 
                <div style={{ height: "1px", background: "#1a1a1a" }} /> 
                <div> 
                  <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 600, color: "#e5e5e5", marginBottom: "8px", }}> Discord </h3> 
                  {user.discordUsername ? ( 
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}> 
                      <p style={{ color: "#555", fontSize: "13px" }}> Linked as <span style={{ color: "#5865F2", fontWeight: 600 }}> {user.discordUsername} </span> </p> 
                      <UnlinkDiscordButton action={unlinkDiscordAction} /> 
                    </div> 
                  ) : ( 
                    <p style={{ color: "#555", fontSize: "13px" }}>No Discord account linked.</p> 
                  )} 
                </div>
                
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

function EmptyState({ message }: { message: string }) { 
  return ( 
    <div style={{ padding: "48px 24px", textAlign: "center", color: "#444", fontSize: "13px", }}> 
      {message} 
    </div> 
  ); 
}