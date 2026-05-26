import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — thesupersuperanime",
};

export default function PrivacyPage() {
  return (
    <div
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "48px 24px 80px",
        color: "#a3a3a3",
        fontSize: "15px",
        lineHeight: "1.7",
      }}
    >
      <h1
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "32px",
          fontWeight: 700,
          color: "#e5e5e5",
          letterSpacing: "-0.02em",
          marginBottom: "8px",
        }}
      >
        Privacy Policy
      </h1>
      <p style={{ color: "#525252", fontSize: "13px", marginBottom: "40px" }}>
        Last updated: May 2025
      </p>

      <Section title="What data we collect">
        <p>We collect only the information needed to provide the service:</p>
        <ul>
          <li>
            <strong style={{ color: "#d4d4d4" }}>Email address</strong> — used for account creation and login.
          </li>
          <li>
            <strong style={{ color: "#d4d4d4" }}>Password</strong> — stored as a secure hash (scrypt). We never store your plain-text password.
          </li>
          <li>
            <strong style={{ color: "#d4d4d4" }}>Discord account</strong> (if you link one) — your Discord ID, username, and avatar are stored to verify access and display your profile.
          </li>
          <li>
            <strong style={{ color: "#d4d4d4" }}>Watch history</strong> — episodes you have watched and your playback progress, tied to your account or an anonymous session.
          </li>
          <li>
            <strong style={{ color: "#d4d4d4" }}>Watchlist</strong> — anime titles you have saved.
          </li>
          <li>
            <strong style={{ color: "#d4d4d4" }}>Comments</strong> — any comments you post on anime pages.
          </li>
        </ul>
        <p>
          If you use the site without an account, a temporary session ID is stored in a cookie for the sole purpose of tracking watch progress. No personal information is collected for anonymous sessions.
        </p>
      </Section>

      <Section title="How we use your data">
        <p>Your data is used exclusively to provide and improve the service:</p>
        <ul>
          <li>Authenticating your account and gating access to the site.</li>
          <li>Saving and resuming your watch progress across devices.</li>
          <li>Displaying your watchlist, comments, and profile.</li>
          <li>Sending account-related emails (e.g. email verification, password reset) via Resend.</li>
        </ul>
        <p>
          We do <strong style={{ color: "#d4d4d4" }}>not</strong> sell your data to any third party. We do not use your personal data for advertising or profiling.
        </p>
      </Section>

      <Section title="Third-party services">
        <p>We rely on the following services to operate the site. Each handles data under their own privacy policies:</p>
        <ul>
          <li>
            <strong style={{ color: "#d4d4d4" }}>Discord</strong> — OAuth login and account verification.
          </li>
          <li>
            <strong style={{ color: "#d4d4d4" }}>Resend</strong> — transactional email delivery (verification emails, password resets).
          </li>
          <li>
            <strong style={{ color: "#d4d4d4" }}>Neon</strong> — PostgreSQL database hosting. Your account and activity data is stored on Neon&apos;s infrastructure.
          </li>
          <li>
            <strong style={{ color: "#d4d4d4" }}>Vercel</strong> — website hosting and serverless function execution.
          </li>
          <li>
            <strong style={{ color: "#d4d4d4" }}>AniList</strong> — anime metadata (titles, descriptions, cover images). No personal data is sent to AniList.
          </li>
        </ul>
      </Section>

      <Section title="Data retention">
        <p>
          Account data (email, hashed password, Discord link, watch history, watchlist, comments) is retained for as long as your account exists. Anonymous session data is tied to a browser cookie and expires naturally with the cookie.
        </p>
        <p>
          When you delete your account, all associated data is permanently removed from our database.
        </p>
      </Section>

      <Section title="Your rights">
        <p>You can delete your account at any time from your{" "}
          <Link href="/account" style={{ color: "#e5e5e5", textDecoration: "underline" }}>
            account settings
          </Link>
          . Deleting your account permanently removes all your personal data including watch history, watchlist, and comments.
        </p>
        <p>
          If you have questions about what data we hold or want to request a correction, contact us at the address below.
        </p>
      </Section>

      <Section title="Cookies">
        <p>We use cookies strictly for site functionality:</p>
        <ul>
          <li>
            <strong style={{ color: "#d4d4d4" }}>site-auth</strong> — site password gate.
          </li>
          <li>
            <strong style={{ color: "#d4d4d4" }}>user-session</strong> — authenticated account session.
          </li>
          <li>
            <strong style={{ color: "#d4d4d4" }}>session-id</strong> — anonymous session for watch progress tracking (1-year expiry).
          </li>
        </ul>
        <p>No third-party tracking cookies are used.</p>
      </Section>

      <Section title="Contact">
        <p>
          For privacy-related questions or data requests, email us at{" "}
          <a
            href="mailto:thesupersupersigma@thesupersupersigma.com"
            style={{ color: "#e5e5e5", textDecoration: "underline" }}
          >
            thesupersupersigma@thesupersupersigma.com
          </a>
          .
        </p>
      </Section>

      <div
        style={{
          marginTop: "48px",
          paddingTop: "24px",
          borderTop: "1px solid #1f1f1f",
          display: "flex",
          gap: "16px",
          fontSize: "13px",
          color: "#525252",
        }}
      >
        <Link href="/" style={{ color: "#525252", textDecoration: "none" }}>
          ← Home
        </Link>
        <Link href="/terms" style={{ color: "#525252", textDecoration: "none" }}>
          Terms of Service
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "36px" }}>
      <h2
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "16px",
          fontWeight: 600,
          color: "#e5e5e5",
          letterSpacing: "-0.01em",
          marginBottom: "12px",
        }}
      >
        {title}
      </h2>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {children}
      </div>
    </section>
  );
}
