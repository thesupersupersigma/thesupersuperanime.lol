import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { DiscordGateCheck } from "./discord-gate-check";
import { AnnouncementBanner } from "@/components/announcement-banner";

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
    discordGateEnabled &&
    user !== null &&
    user.discordId === null &&
    user.emailVerified === false &&
    typeof user.emailVerifyToken === "string"
  ) {
    redirect("/account/verify-email-pending");
  }

  // Gate: a logged-in user with neither a linked Discord nor a custom username
  // has an incomplete profile — force them through setup before browsing.
  // Runs AFTER the verification block so unverified users hit verification
  // first. setup-profile lives at /account/setup-profile (outside the (site)
  // group), so this can't loop.
  if (
    user !== null &&
    user.discordId === null &&
    !user.username
  ) {
    redirect("/account/setup-profile");
  }

  return (
    <>
      <AnnouncementBanner />
      <main
        className="site-main animate-page"
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
      <footer
        style={{
          borderTop: "1px solid #1a1a1a",
          padding: "20px 24px",
          display: "flex",
          justifyContent: "center",
          gap: "24px",
        }}
      >
        <Link
          href="/updates"
          style={{ color: "#404040", fontSize: "12px", textDecoration: "none" }}
        >
          Updates
        </Link>
        <Link
          href="/status"
          style={{ color: "#404040", fontSize: "12px", textDecoration: "none" }}
        >
          Status
        </Link>
        <Link
          href="/privacy"
          style={{ color: "#404040", fontSize: "12px", textDecoration: "none" }}
        >
          Privacy Policy
        </Link>
        <Link
          href="/terms"
          style={{ color: "#404040", fontSize: "12px", textDecoration: "none" }}
        >
          Terms of Service
        </Link>
      </footer>
    </>
  );
}