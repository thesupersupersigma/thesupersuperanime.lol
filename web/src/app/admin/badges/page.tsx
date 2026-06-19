import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { userIsBadgeOwner } from "@/lib/badge-engine";
import { BadgeManagementPanel } from "@/components/admin/BadgeManagementPanel";

export const metadata: Metadata = {
  title: "Badge Management — thesupersuperanime",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminBadgesPage() {
  const user = await getCurrentUser();
  const isOwner = user ? userIsBadgeOwner(user) : false;
  if (!isAdmin(user?.discordId) && !isOwner) {
    redirect("/");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f0f",
        color: "#e5e5e5",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ maxWidth: "820px", margin: "0 auto", padding: "80px 24px" }}>
        <Link
          href="/admin"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            color: "#555",
            fontSize: "13px",
            textDecoration: "none",
            marginBottom: "24px",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back to admin
        </Link>
        <h1
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "22px",
            fontWeight: 700,
            marginBottom: "4px",
          }}
        >
          Badge Management
        </h1>
        <p style={{ color: "#555", fontSize: "13px", marginBottom: "28px" }}>
          Grant or revoke badges for any user.
        </p>
        <BadgeManagementPanel isOwner={isOwner} />
      </div>
    </div>
  );
}
