import { getCurrentUser, isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ChatPanel } from "@/components/chat/ChatPanel";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/account");

  // isAdmin check for moderation controls
  const adminStatus = isAdmin(user.discordId);

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px", paddingBottom: "48px" }}>
      <div>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "22px", fontWeight: 700, color: "#e5e5e5", letterSpacing: "-0.02em", marginBottom: "4px" }}>
          Global Chat
        </h1>
        <p style={{ color: "#555", fontSize: "13px" }}>
          Chat with everyone watching thesupersuperanime right now.
        </p>
      </div>
      <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: "12px", overflow: "hidden" }}>
        <ChatPanel
          roomId="global"
          currentUserId={user.id}
          isAdmin={adminStatus}
          height={600}
          placeholder="Say something..."
        />
      </div>
    </div>
  );
}
