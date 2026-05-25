"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const EXEMPT = ["/account", "/account/link-discord"];

export function DiscordGateCheck() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (EXEMPT.includes(pathname)) return;

    fetch("/api/auth/me")
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.discordLinked === false) {
          router.push("/account/link-discord");
        }
      })
      .catch(() => {});
  }, [pathname, router]);

  return null;
}
