"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface SearchBarProps {
  /** Placeholder text */
  placeholder?: string;
  /** Additional class names */
  className?: string;
  /** Compact mode for nav */
  compact?: boolean;
}

export function SearchBar({
  placeholder = "Search anime...",
  compact = false,
}: SearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const isInitialRender = useRef(true);

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      if (query.trim()) {
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      } else {
        router.push("/search");
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query, router]);

  return (
    <div
      style={{
        position: "relative",
        width: compact ? "100%" : "100%",
        maxWidth: compact ? "400px" : "600px",
      }}
    >
      <svg
        style={{
          position: "absolute",
          left: "10px",
          top: "50%",
          transform: "translateY(-50%)",
          color: "#666",
          pointerEvents: "none",
        }}
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          background: "#1a1a1a",
          border: "1px solid #2a2a2a",
          borderRadius: "6px",
          padding: compact ? "7px 12px 7px 32px" : "10px 12px 10px 34px",
          color: "#e5e5e5",
          fontSize: compact ? "13px" : "14px",
          fontFamily: "'DM Sans', sans-serif",
          outline: "none",
          transition: "border-color 150ms ease",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "#3b82f6";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "#2a2a2a";
        }}
      />
    </div>
  );
}
