import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — thesupersuperanime",
};

export default function TermsPage() {
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
        Terms of Service
      </h1>
      <p style={{ color: "#525252", fontSize: "13px", marginBottom: "40px" }}>
        Last updated: May 2025
      </p>

      <Section title="Overview">
        <p>
          By using thesupersuperanime.lol (&quot;the site&quot;, &quot;the service&quot;), you agree to these terms. If you do not agree, do not use the site.
        </p>
      </Section>

      <Section title="Eligibility">
        <p>
          You must be at least 13 years old to use this service. By creating an account, you confirm you meet this requirement.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>Share your account credentials with anyone else. Accounts are for personal use only.</li>
          <li>Scrape, crawl, or otherwise automate requests to the site beyond normal browsing.</li>
          <li>Attempt to circumvent rate limits, authentication, or access controls.</li>
          <li>Abuse the platform in any way that degrades the experience for other users or strains server resources.</li>
          <li>Post comments that are illegal, threatening, harassing, or otherwise harmful.</li>
        </ul>
      </Section>

      <Section title="Content">
        <p>
          Videos and anime metadata displayed on this site are streamed from third-party sources. We do not host or store any video content. We make no representation about the accuracy, legality, or availability of content from those sources.
        </p>
        <p>
          Content availability may change at any time without notice depending on third-party sources.
        </p>
      </Section>

      <Section title="Service availability">
        <p>
          The service is provided &quot;as-is&quot; without any warranties of uptime, accuracy, or fitness for a particular purpose. We reserve the right to modify, suspend, or discontinue the service at any time, with or without notice. We are not liable for any loss resulting from downtime or changes to the service.
        </p>
      </Section>

      <Section title="Accounts">
        <p>
          You are responsible for maintaining the security of your account and password. You are responsible for all activity that occurs under your account. We reserve the right to terminate accounts that violate these terms.
        </p>
        <p>
          You can delete your account at any time from your{" "}
          <Link href="/account" style={{ color: "#e5e5e5", textDecoration: "underline" }}>
            account settings
          </Link>
          .
        </p>
      </Section>

      <Section title="Changes to these terms">
        <p>
          We may update these terms from time to time. Continued use of the service after changes are posted constitutes your acceptance of the updated terms.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          For legal or terms-related questions, contact us at{" "}
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
        <Link href="/privacy" style={{ color: "#525252", textDecoration: "none" }}>
          Privacy Policy
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
