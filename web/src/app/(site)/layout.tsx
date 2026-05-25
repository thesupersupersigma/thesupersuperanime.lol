import { DiscordGateCheck } from "./discord-gate-check";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
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
      <DiscordGateCheck />
      {children}
    </main>
  );
}