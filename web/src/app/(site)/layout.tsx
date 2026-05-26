import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DiscordGateCheck } from "./discord-gate-check";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // DISCORD_GATE=off disables the client-side gate check too (default: on)
  const discordGateEnabled = process.env.DISCORD_GATE !== "off";

  // Gate: redirect to email verification only when ALL four conditions are met:
  //   1. user is logged in (not null)
  //   2. no Discord linked
  //   3. email not verified
  //   4. an actual pending token exists (pre-feature / already-verified users
  //      have emailVerifyToken = null and must NEVER be redirected here)
  const user = await getCurrentUser();
  if (
    user !== null &&
    user.discordId === null &&
    user.emailVerified === false &&
    typeof user.emailVerifyToken === "string"
  ) {
    redirect("/account/verify-email-pending");
  }

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