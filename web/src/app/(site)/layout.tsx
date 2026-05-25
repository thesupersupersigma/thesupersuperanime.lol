import { DiscordGateCheck } from "./discord-gate-check";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  // DISCORD_GATE=off disables the client-side gate check too (default: on)
  const discordGateEnabled = process.env.DISCORD_GATE !== "off";

  return (
    <main
      className="site-main"
      style={{
        maxWidth: "1280px",
        margin: "0 auto",
        padding: "24px 24px 80px",
        minHeight: "calc(100vh - 56px)",
      }}
    >
      {discordGateEnabled && <DiscordGateCheck />}
      {children}
    </main>
  );
}