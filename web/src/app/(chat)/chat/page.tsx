import { getCurrentUser, isAdmin as checkIsAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ensureDefaultChannels } from "@/lib/chat";
import { DiscordChat } from "@/components/chat/DiscordChat";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/account");
  const adminStatus = checkIsAdmin(user.discordId);
  const initialChannels = await ensureDefaultChannels();

  return (
    <DiscordChat
      userId={user.id}
      isAdmin={adminStatus}
      initialChannels={initialChannels.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? undefined,
        position: c.position,
      }))}
    />
  );
}
