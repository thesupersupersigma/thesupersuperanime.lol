"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SearchBar } from "./search-bar";

export function Nav() {
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check auth state client-side by pinging a lightweight endpoint
  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(data => setIsLoggedIn(!!data?.userId))
      .catch(() => {})
  }, [pathname]) // re-check on navigation

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
            {/* Watchlist/search bookmark */}
            <Link href="/search" style={{
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
                transition: "color 150ms ease",
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
      {icon}
      <span>{label}</span>
    </Link>
  );
}