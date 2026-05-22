import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

function buildDiscordOAuthUrl(userId: string) {
  // Encode userId as state so we can retrieve it in the callback
  // without needing the session cookie
  const state = Buffer.from(JSON.stringify({ userId })).toString("base64url");
  
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")}/api/auth/discord/callback`,
    response_type: "code",
    scope: "identify guilds.join",
    state,
  });
  return `https://discord.com/api/oauth2/authorize?${params}`;
}

export default async function LinkDiscordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/account");
  if (user.discordId) redirect("/");

  const { error } = await searchParams;

  const errorMessages: Record<string, string> = {
    cancelled: "You cancelled the Discord login. Please try again.",
    token: "Failed to connect to Discord. Please try again.",
    user: "Could not fetch your Discord profile. Please try again.",
    server: "Something went wrong. Please try again.",
    no_session: "Session expired. Please try again.",
  };

  const oauthUrl = buildDiscordOAuthUrl(user.id);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "440px",
        background: "#111",
        border: "1px solid #2a2a2a",
        borderRadius: "16px",
        padding: "40px",
        position: "relative",
        overflow: "hidden",
        textAlign: "center",
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, width: "100%", height: "1px",
          background: "linear-gradient(to right, transparent, rgba(88,101,242,0.6), transparent)",
        }} />

        <div style={{
          width: "64px", height: "64px", borderRadius: "50%",
          background: "#5865F2", margin: "0 auto 24px",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="32" height="24" viewBox="0 0 127.14 96.36" fill="white">
            <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
          </svg>
        </div>

        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontSize: "22px",
          fontWeight: 700, color: "#e5e5e5", letterSpacing: "-0.02em", marginBottom: "12px",
        }}>
          Link your Discord
        </h1>

        <p style={{ color: "#666", fontSize: "13px", lineHeight: "1.7", marginBottom: "8px" }}>
          To access the site, you need to link your Discord account. This verifies you're a real person and automatically adds you to our server.
        </p>

        <p style={{ color: "#444", fontSize: "12px", lineHeight: "1.6", marginBottom: "28px" }}>
          Signed in as <span style={{ color: "#666" }}>{user.email}</span>
        </p>

        {error && (
          <div style={{
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            color: "#f87171", fontSize: "13px", padding: "10px 16px",
            borderRadius: "8px", marginBottom: "20px",
          }}>
            {errorMessages[error] ?? "Something went wrong."}
          </div>
        )}

        <a href={oauthUrl} style={{
          display: "block",
          background: "#5865F2",
          color: "#fff",
          padding: "14px",
          borderRadius: "10px",
          fontWeight: 700,
          fontSize: "14px",
          textDecoration: "none",
          marginBottom: "16px",
        }}>
          Continue with Discord
        </a>

        <p style={{ color: "#333", fontSize: "11px" }}>
          We only read your username and ID. We never post on your behalf.
        </p>
      </div>
    </div>
  );
}