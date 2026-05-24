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
    } catch (err: any) {
      setStatus({ message: err.message, type: "error" });
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