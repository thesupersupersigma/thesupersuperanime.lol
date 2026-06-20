"use client"; 

import { useState, useRef } from "react"; 
import { useRouter } from "next/navigation";

export function SignOutButton({ action }: { action: () => Promise<void> }) { 
  return ( 
    <form action={action}> 
      <button type="submit" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", padding: "10px 20px", borderRadius: "8px", fontWeight: 600, fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap", }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.15)")} onMouseLeave={e => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")} > Sign Out </button> 
    </form> 
  ); 
} 

export function ImportButton() { 
  const fileInputRef = useRef<HTMLInputElement>(null); 
  const [loading, setLoading] = useState(false); 
  const [status, setStatus] = useState<{ message: string; type: "success" | "error" | null }>({ message: "", type: null }); 
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { 
    const file = e.target.files?.[0]; 
    if (!file) return; 
    setLoading(true); 
    setStatus({ message: "Reading file...", type: null }); 
    
    try { 
      const text = await file.text(); 
      setStatus({ message: "Importing to database...", type: null }); 
      const res = await fetch("/api/import", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ content: text }), 
      }); 
      const data = await res.json(); 
      if (!res.ok) throw new Error(data.error || "Failed to import"); 
      setStatus({ message: `Success! Imported ${data.imported} shows.`, type: "success" });
    } catch (err: unknown) {
      setStatus({ message: err instanceof Error ? err.message : "Failed to import", type: "error" });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = ""; 
    }
  }; 
  
  return ( 
    <div> 
      <input type="file" accept=".json,.txt,.xml" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        style={{
          width: "100%",
          background: loading ? "#1a1a1a" : "#0f0f0f",
          border: "1px solid #2a2a2a",
          borderRadius: "8px",
          color: loading ? "#666" : "#a3a3a3",
          padding: "12px",
          fontSize: "13px",
          fontWeight: 600,
          cursor: loading ? "wait" : "pointer",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={e => {
          if (!loading) {
            e.currentTarget.style.borderColor = "#3b82f6";
            e.currentTarget.style.color = "#e5e5e5";
          }
        }}
        onMouseLeave={e => {
          if (!loading) {
            e.currentTarget.style.borderColor = "#2a2a2a";
            e.currentTarget.style.color = "#a3a3a3";
          }
        }}
      >
        {loading ? "Processing..." : "Upload Backup (.json / .txt / .xml)"}
      </button>
      {status.message && (
        <div style={{
          marginTop: "12px",
          fontSize: "12px",
          fontWeight: 500,
          textAlign: "center",
          color: status.type === "success" ? "#22c55e" : "#ef4444"
        }}>
          {status.message}
        </div>
      )}
    </div>
  ); 
} 

export function UnlinkDiscordButton({ action }: { action: () => Promise<{ error?: string; success?: boolean }> }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!confirm("Unlink your Discord account? You'll need to re-link to use the site.")) return;
    setLoading(true);
    const res = await action();
    if (res.success) {
      window.location.href = "/account/link-discord";
    }
    setLoading(false);
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        background: "rgba(88,101,242,0.08)",
        border: "1px solid rgba(88,101,242,0.2)",
        color: "#818cf8",
        padding: "8px 16px",
        borderRadius: "8px",
        fontWeight: 600,
        fontSize: "12px",
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(88,101,242,0.15)")}
      onMouseLeave={e => (e.currentTarget.style.background = "rgba(88,101,242,0.08)")}
    >
      {loading ? "Unlinking..." : "Unlink"}
    </button>
  );
}

export function AniListConnectButton({ userId }: { userId: string }) {
  function handleClick() {
    const state = btoa(JSON.stringify({ userId })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const clientId = process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID;
    const cleanBaseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
    const redirectUri = encodeURIComponent(`${cleanBaseUrl}/api/auth/anilist/callback`);
    window.location.href = `https://anilist.co/api/v2/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&state=${state}`;
  }

  return (
    <button
      onClick={handleClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: "8px",
        background: "#02a9ff", color: "#fff", border: "none",
        borderRadius: "8px", padding: "9px 16px",
        fontSize: "13px", fontWeight: 600, cursor: "pointer",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "#0284c7")}
      onMouseLeave={e => (e.currentTarget.style.background = "#02a9ff")}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6.361 2.943 0 21.056h4.942l1.077-3.133H12.6l1.077 3.133H18.6L12.239 2.943ZM7.326 14l2.302-6.697L11.93 14Z"/>
        <path d="M18.714 2.943v18.113h4.942V2.943Z"/>
      </svg>
      Connect AniList
    </button>
  );
}

export function DeleteAccountButton({ action }: { action: () => Promise<{ error?: string; success?: boolean }> }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!confirm("Permanently delete your account? This cannot be undone. All watch history, watchlist, and comments will be deleted.")) return;
    setLoading(true);
    const res = await action();
    if (res.success) {
      window.location.href = "/";
    } else {
      alert(res.error ?? "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.2)",
        color: "#f87171",
        padding: "8px 16px",
        borderRadius: "8px",
        fontWeight: 600,
        fontSize: "12px",
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.15)")}
      onMouseLeave={e => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
    >
      {loading ? "Deleting..." : "Delete Account"}
    </button>
  );
}