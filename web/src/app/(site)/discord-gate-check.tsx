"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// Paths inside the (site) group that must never trigger a gate redirect
const EXEMPT = [
  "/account",
  "/account/link-discord",
  "/account/verify-email-pending",
  "/account/verify-email",
  "/account/verify-email-error",
];

export function DiscordGateCheck() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (EXEMPT.includes(pathname)) return;

    fetch("/api/auth/me")
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        // User passes the gate if they have Discord linked OR a verified email
        if (data && !data.discordLinked && !data.emailVerified) {
          router.push("/account/link-discord");
        }
      })
      .catch(() => {});
  }, [pathname, router]);

  return null;
}
