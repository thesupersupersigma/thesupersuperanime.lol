"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SearchBar } from "./search-bar";

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // --- YOUR NEW EFFECT LOGIC ---
  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.userId) {
          setIsLoggedIn(false);
          return;
        }
        setIsLoggedIn(true);
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
            transition: "color 150ms ease",
          }}
            onMouseEnter={e => (e.currentTarget.style.color = "#3b82f6")}
            onMouseLeave={e => (e.currentTarget.style.color = "#e5e5e5")}
          >
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
            
            {/* Genres */}
            <Link href="/genres" style={{
              display: "flex", alignItems: "center",
              color: pathname.startsWith("/genres") ? "#e5e5e5" : "#888",
              textDecoration: "none", transition: "color 150ms ease, transform 150ms ease",
              transform: pathname.startsWith("/genres") ? "scale(1.1)" : "scale(1)",
            }}
              title="Browse by Genre"
              onMouseEnter={e => (e.currentTarget.style.color = "#e5e5e5")}
              onMouseLeave={e => (e.currentTarget.style.color = pathname.startsWith("/genres") ? "#e5e5e5" : "#888")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </Link>

            {/* Random anime */}
            <Link href="/random" style={{
              display: "flex", alignItems: "center",
              color: "#888",
              textDecoration: "none", transition: "color 150ms ease",
            }}
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

            {/* Leaderboard/Ranks bookmark */}
            <Link href="/leaderboard" style={{
              display: "flex", alignItems: "center",
              color: pathname === "/leaderboard" ? "#e5e5e5" : "#888",
              textDecoration: "none", transition: "color 150ms ease, transform 150ms ease",
              transform: pathname === "/leaderboard" ? "scale(1.1)" : "scale(1)",
            }}
              onMouseEnter={e => (e.currentTarget.style.color = "#e5e5e5")}
              onMouseLeave={e => (e.currentTarget.style.color = pathname === "/leaderboard" ? "#e5e5e5" : "#888")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </Link>

            {/* Report issue */}
            <Link href="/issues" style={{
              display: "flex", alignItems: "center",
              color: pathname === "/issues" ? "#e5e5e5" : "#888",
              textDecoration: "none", transition: "color 150ms ease, transform 150ms ease",
              transform: pathname === "/issues" ? "scale(1.1)" : "scale(1)",
            }}
              title="Issues &amp; Suggestions"
              onMouseEnter={e => (e.currentTarget.style.color = "#e5e5e5")}
              onMouseLeave={e => (e.currentTarget.style.color = pathname === "/issues" ? "#e5e5e5" : "#888")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </Link>

            {/* Feed — friends' activity (logged-in only) */}
            {isLoggedIn && (
              <Link href="/feed" style={{
                display: "flex", alignItems: "center",
                color: pathname === "/feed" ? "#e5e5e5" : "#888",
                textDecoration: "none", transition: "color 150ms ease, transform 150ms ease",
                transform: pathname === "/feed" ? "scale(1.1)" : "scale(1)",
              }}
                title="Friends' Activity"
                onMouseEnter={e => (e.currentTarget.style.color = "#e5e5e5")}
                onMouseLeave={e => (e.currentTarget.style.color = pathname === "/feed" ? "#e5e5e5" : "#888")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </Link>
            )}

            {/* Global Chat (logged-in only) */}
            {isLoggedIn && (
              <Link href="/chat" style={{
                display: "flex", alignItems: "center",
                color: pathname === "/chat" ? "#e5e5e5" : "#888",
                textDecoration: "none", transition: "color 150ms ease, transform 150ms ease",
                transform: pathname === "/chat" ? "scale(1.1)" : "scale(1)",
              }}
                title="Global Chat"
                onMouseEnter={e => (e.currentTarget.style.color = "#e5e5e5")}
                onMouseLeave={e => (e.currentTarget.style.color = pathname === "/chat" ? "#e5e5e5" : "#888")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </Link>
            )}

            {/* Watchlist/search bookmark */}
            <Link href="/account?tab=watchlist" style={{
              display: "flex",
              alignItems: "center",
              color: "#888",
              textDecoration: "none",
              transition: "color 150ms ease",
            }}
              onMouseEnter={e => (e.currentTarget.style.color = "#e5e5e5")}
              onMouseLeave={e => (e.currentTarget.style.color = "#888")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </Link>

            {isLoggedIn ? (
              // Account icon when logged in
              <Link href="/account" style={{
                display: "flex",
                alignItems: "center",
                color: pathname === "/account" ? "#e5e5e5" : "#888",
                textDecoration: "none",
                transition: "color 150ms ease, transform 150ms ease",
                transform: pathname === "/account" ? "scale(1.1)" : "scale(1)",
              }}
                onMouseEnter={e => (e.currentTarget.style.color = "#e5e5e5")}
                onMouseLeave={e => (e.currentTarget.style.color = pathname === "/account" ? "#e5e5e5" : "#888")}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </Link>
            ) : (
              // Sign in button when logged out
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