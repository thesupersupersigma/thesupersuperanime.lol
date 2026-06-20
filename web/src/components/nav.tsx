"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { SearchBar } from "./search-bar";

type UserInfo = {
  username: string | null;
  displayName: string | null;
  discordUsername: string | null;
  discordAvatar: string | null;
  discordId: string | null;
  avatarPreset: number | null;
};

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // --- YOUR NEW EFFECT LOGIC ---
  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.userId) {
          setIsLoggedIn(false);
          setUserInfo(null);
          setIsAdmin(false);
          return;
        }
        setIsLoggedIn(true);
        setIsAdmin(!!data.isAdmin);
        setUserInfo({
          username: data.username ?? null,
          displayName: data.displayName ?? null,
          discordUsername: data.discordUsername ?? null,
          discordAvatar: data.discordAvatar ?? null,
          discordId: data.discordId ?? null,
          avatarPreset: data.avatarPreset ?? null,
        });
        // Gate is off — stop here, router.push is never called.
        if (!data.gateEnabled) return;
        // Gate: must have Discord linked OR verified email to browse the site.
        if (!data.discordLinked && !data.emailVerified) {
          const exempt =
            pathname === "/account" ||
            pathname.startsWith("/account/");
          if (!exempt) {
            router.push("/account/link-discord");
          }
        }
      })
      .catch(() => {})
  }, [pathname, router])
  // --- END OF NEW EFFECT LOGIC ---

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close dropdown on route change (render-phase state adjustment, not an effect)
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setDropdownOpen(false);
  }

  return (
    <>
      {/* Desktop nav */}
      <nav style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(15, 15, 15, 0.9)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid #1f1f1f",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "24px",
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "0 24px",
          height: "56px",
        }}>
          {/* Left — site name */}
          <Link href="/" style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "15px",
            fontWeight: 700,
            color: "#e5e5e5",
            textDecoration: "none",
            whiteSpace: "nowrap",
            letterSpacing: "-0.02em",
          }}>
            thesupersuperanime
          </Link>

          {/* Center — search */}
          <div className="desktop-search" style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <Suspense fallback={null}>
              <SearchBar compact />
            </Suspense>
          </div>

          {/* Right — account or sign in */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>

            {/* Random anime */}
            <Link href="/random" style={iconLinkStyle(false)}
              title="Random Anime"
              onMouseEnter={e => (e.currentTarget.style.color = "#e5e5e5")}
              onMouseLeave={e => (e.currentTarget.style.color = "#888")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="3" ry="3"/>
                <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/>
                <circle cx="16" cy="8" r="1.2" fill="currentColor" stroke="none"/>
                <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
                <circle cx="8" cy="16" r="1.2" fill="currentColor" stroke="none"/>
                <circle cx="16" cy="16" r="1.2" fill="currentColor" stroke="none"/>
              </svg>
            </Link>

            {/* Announcements / changelog bell */}
            <Link href="/updates" style={iconLinkStyle(pathname === "/updates")}
              title="Updates & Changelog"
              onMouseEnter={e => (e.currentTarget.style.color = "#e5e5e5")}
              onMouseLeave={e => (e.currentTarget.style.color = pathname === "/updates" ? "#e5e5e5" : "#888")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </Link>

            {/* Status page indicator */}
            <Link href="/status" style={iconLinkStyle(pathname === "/status")}
              title="Site Status"
              onMouseEnter={e => (e.currentTarget.style.color = "#e5e5e5")}
              onMouseLeave={e => (e.currentTarget.style.color = pathname === "/status" ? "#e5e5e5" : "#888")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </Link>

            {/* Divider */}
            <div style={{ width: "1px", height: "20px", background: "#2a2a2a" }} />

            {isLoggedIn ? (
              <div ref={dropdownRef} style={{ position: "relative" }}>
                {/* Avatar button */}
                <button
                  onClick={() => setDropdownOpen(o => !o)}
                  style={{
                    width: "32px", height: "32px", borderRadius: "50%",
                    border: dropdownOpen ? "2px solid #3b82f6" : "2px solid #2a2a2a",
                    overflow: "hidden", cursor: "pointer", background: "#1a1a1a",
                    padding: 0, transition: "border-color 150ms ease",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <AvatarImage userInfo={userInfo} size={32} iconSize={18} />
                </button>

                {/* Dropdown */}
                {dropdownOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 10px)", right: 0,
                    width: "220px", background: "#111", border: "1px solid #2a2a2a",
                    borderRadius: "12px", overflow: "hidden",
                    boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
                    animation: "slide-down 0.2s ease both",
                    zIndex: 999,
                  }}>
                    {/* Header */}
                    <Link href={`/user/${userInfo?.username ?? userInfo?.discordUsername}`}
                      onClick={() => setDropdownOpen(false)}
                      style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px",
                        borderBottom: "1px solid #1a1a1a", textDecoration: "none",
                        background: "#0f0f0f",
                      }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "50%", overflow: "hidden",
                        border: "1px solid #2a2a2a", flexShrink: 0, background: "#1a1a1a",
                        display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <AvatarImage userInfo={userInfo} size={36} iconSize={20} />
                      </div>
                      <div>
                        <div style={{ color: "#e5e5e5", fontSize: "13px", fontWeight: 600 }}>
                          {userInfo?.displayName ?? userInfo?.discordUsername ?? "User"}
                        </div>
                        <div style={{ color: "#555", fontSize: "11px" }}>
                          @{userInfo?.username ?? userInfo?.discordUsername}
                        </div>
                      </div>
                    </Link>

                    {/* Nav items */}
                    {[
                      { label: "Profile", href: `/user/${userInfo?.username ?? userInfo?.discordUsername}` },
                      { label: "Watchlist", href: "/account?tab=watchlist" },
                      { label: "Watch History", href: "/account?tab=history" },
                      { label: "Feed", href: "/feed" },
                      { label: "Chat", href: "/chat" },
                    ].map(item => (
                      <DropdownItem key={item.href} href={item.href} onClose={() => setDropdownOpen(false)} label={item.label} />
                    ))}

                    <div style={{ borderTop: "1px solid #1a1a1a" }} />

                    {[
                      { label: "Leaderboard", href: "/leaderboard" },
                      { label: "Issues", href: "/issues" },
                      { label: "Genres", href: "/genres" },
                    ].map(item => (
                      <DropdownItem key={item.href} href={item.href} onClose={() => setDropdownOpen(false)} label={item.label} />
                    ))}

                    {isAdmin && (
                      <>
                        <div style={{ borderTop: "1px solid #1a1a1a" }} />
                        <DropdownItem href="/admin" onClose={() => setDropdownOpen(false)} label="Admin Panel" />
                      </>
                    )}

                    <div style={{ borderTop: "1px solid #1a1a1a" }} />

                    <DropdownItem href="/account?tab=settings" onClose={() => setDropdownOpen(false)} label="Settings" />

                    {/* Sign out button */}
                    <button
                      onClick={async () => {
                        setDropdownOpen(false);
                        await fetch("/api/auth/signout", { method: "POST" });
                        router.push("/account");
                        router.refresh();
                      }}
                      style={{ width: "100%", textAlign: "left", padding: "10px 16px",
                        background: "none", border: "none", cursor: "pointer",
                        color: "#ef4444", fontSize: "13px", transition: "background 100ms",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#1a1a1a")}
                      onMouseLeave={e => (e.currentTarget.style.background = "none")}
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/account" style={{
                background: "#1a1a1a",
                border: "1px solid #2a2a2a",
                color: "#a3a3a3",
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                textDecoration: "none",
                transition: "border-color 0.2s, color 0.2s",
                whiteSpace: "nowrap",
              }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = "#3b82f6"
                  e.currentTarget.style.color = "#e5e5e5"
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = "#2a2a2a"
                  e.currentTarget.style.color = "#a3a3a3"
                }}
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <div className="mobile-tab-bar" style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: "rgba(15, 15, 15, 0.95)",
        borderTop: "1px solid #1f1f1f",
        justifyContent: "space-around",
        padding: "6px 0 env(safe-area-inset-bottom, 6px)",
      }}>
        <MobileTab href="/" label="Home" active={pathname === "/"} icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        } />
        <MobileTab href="/search" label="Search" active={pathname === "/search"} icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        } />
        <MobileTab href="/genres" label="Genres" active={pathname.startsWith("/genres")} icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        } />
        <MobileTab href="/random" label="Random" active={pathname === "/random"} icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="3" ry="3"/>
            <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="16" cy="8" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="8" cy="16" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="16" cy="16" r="1.2" fill="currentColor" stroke="none"/>
          </svg>
        } />
        {isLoggedIn && (
          <MobileTab href="/chat" label="Chat" active={pathname === "/chat"} icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          } />
        )}
        <MobileTab href="/leaderboard" label="Ranks" active={pathname === "/leaderboard"} icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
        } />
        <MobileTab href="/issues" label="Issues" active={pathname === "/issues"} icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        } />
        <MobileTab href="/account" label={isLoggedIn ? "Account" : "Sign In"} active={pathname === "/account"} icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        } />
      </div>
    </>
  );
}

function MobileTab({ href, label, active, icon }: {
  href: string
  label: string
  active: boolean
  icon: React.ReactNode
}) {
  return (
    <Link href={href} style={{
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "2px",
      padding: "6px 16px",
      color: active ? "#3b82f6" : "#666",
      textDecoration: "none",
      fontSize: "11px",
      fontWeight: 500,
      transition: "color 150ms ease",
    }}>
      <div style={{
        position: "absolute",
        top: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: active ? "20px" : "0px",
        height: "2px",
        background: "#3b82f6",
        borderRadius: "0 0 2px 2px",
        transition: "width 200ms ease",
      }} />
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function iconLinkStyle(active: boolean) {
  return {
    display: "flex", alignItems: "center",
    color: active ? "#e5e5e5" : "#888",
    textDecoration: "none",
    transition: "color 150ms ease",
  } as React.CSSProperties;
}

function AvatarImage({ userInfo, size, iconSize }: {
  userInfo: {
    discordAvatar: string | null;
    discordId: string | null;
    avatarPreset: number | null;
  } | null;
  size: number;
  iconSize: number;
}) {
  if (userInfo?.discordAvatar && userInfo?.discordId) {
    return (
      <img
        src={`https://cdn.discordapp.com/avatars/${userInfo.discordId}/${userInfo.discordAvatar}.png?size=64`}
        alt="avatar" width={size} height={size}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }
  if (userInfo?.avatarPreset) {
    return (
      <img
        src={`/avatars/${userInfo.avatarPreset}.png`}
        alt="avatar" width={size} height={size}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" style={{ display: "block", margin: "auto" }}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function DropdownItem({ href, label, onClose }: { href: string; label: string; onClose: () => void }) {
  return (
    <Link href={href} onClick={onClose} style={{
      display: "block", padding: "10px 16px", color: "#a3a3a3",
      textDecoration: "none", fontSize: "13px", transition: "background 100ms, color 100ms",
    }}
      onMouseEnter={e => { e.currentTarget.style.background = "#1a1a1a"; e.currentTarget.style.color = "#e5e5e5"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#a3a3a3"; }}
    >
      {label}
    </Link>
  );
}