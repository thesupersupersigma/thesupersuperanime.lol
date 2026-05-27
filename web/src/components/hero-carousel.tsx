"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { getDisplayTitle } from "@/lib/anilist";
import type { AnilistMedia } from "@/lib/anilist";

interface Props {
  slides: AnilistMedia[];
}

export function HeroCarousel({ slides }: Props) {
  const [current, setCurrent] = useState(0);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start (or restart) the 5-second auto-advance timer.
  // Calling this on manual nav resets the interval so slides don't jump
  // immediately after a click.
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrent((i) => (i + 1) % slides.length);
    }, 5000);
  }, [slides.length]);

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTimer]);

  const goNext = () => {
    setCurrent((i) => (i + 1) % slides.length);
    startTimer();
  };

  const goPrev = () => {
    setCurrent((i) => (i - 1 + slides.length) % slides.length);
    startTimer();
  };

  const goTo = (idx: number) => {
    setCurrent(idx);
    startTimer();
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        width: "100%",
        height: "50vh",
        minHeight: "400px",
        overflow: "hidden",
        borderRadius: "12px",
        border: "1px solid #2a2a2a",
        backgroundColor: "#0a0a0a",
      }}
    >
      {/* ── Slides (stacked, crossfade via opacity) ───────────────────────── */}
      {slides.map((anime, i) => {
        const title = getDisplayTitle(anime.title);
        const description =
          anime.description?.replace(/<[^>]*>?/gm, "") ||
          "No description available.";
        const isActive = i === current;

        return (
          <div
            key={anime.id}
            aria-hidden={!isActive}
            style={{
              position: "absolute",
              inset: 0,
              opacity: isActive ? 1 : 0,
              transition: "opacity 0.75s ease",
              // keep inactive slides non-interactive so links don't trap focus
              pointerEvents: isActive ? "auto" : "none",
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            {/* Background image + gradients */}
            <div style={{ position: "absolute", inset: 0 }}>
              <Image
                src={
                  anime.bannerImage ||
                  anime.coverImage.extraLarge ||
                  anime.coverImage.large
                }
                alt={title}
                fill
                sizes="100vw"
                style={{ objectFit: "cover", opacity: 0.5 }}
                priority={i === 0}
              />
              {/* bottom-to-top dark fade — keeps content legible */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(to top, #0a0a0a 0%, transparent 100%)",
                }}
              />
              {/* left-to-right dark fade — keeps title legible on wide images */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(to right, #0a0a0a 0%, transparent 100%)",
                  opacity: 0.8,
                }}
              />
            </div>

            {/* Text + button — identical markup/styles to the original hero */}
            <div
              style={{
                position: "relative",
                zIndex: 10,
                padding: "32px",
                // extra bottom padding so dot indicators never overlap the button
                paddingBottom: "52px",
                maxWidth: "800px",
              }}
            >
              <h1
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontSize: "36px",
                  fontWeight: 700,
                  color: "#fff",
                  marginBottom: "12px",
                  letterSpacing: "-0.02em",
                }}
              >
                {title}
              </h1>
              <p
                style={{
                  color: "#a3a3a3",
                  fontSize: "14px",
                  lineHeight: "1.6",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  marginBottom: "24px",
                }}
              >
                {description}
              </p>
              <Link
                href={`/anime/${anime.id}`}
                style={{
                  background: "#e5e5e5",
                  color: "#0a0a0a",
                  padding: "10px 24px",
                  borderRadius: "6px",
                  fontWeight: 600,
                  textDecoration: "none",
                  fontSize: "14px",
                  display: "inline-block",
                }}
              >
                Watch Now
              </Link>
            </div>
          </div>
        );
      })}

      {/* ── Left arrow ────────────────────────────────────────────────────── */}
      <button
        onClick={goPrev}
        aria-label="Previous"
        style={{
          position: "absolute",
          left: "16px",
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 20,
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          background: "rgba(10,10,10,0.6)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "#e5e5e5",
          fontSize: "22px",
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.2s ease, background 0.15s ease",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.background =
            "rgba(30,30,30,0.85)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.background =
            "rgba(10,10,10,0.6)")
        }
      >
        ‹
      </button>

      {/* ── Right arrow ───────────────────────────────────────────────────── */}
      <button
        onClick={goNext}
        aria-label="Next"
        style={{
          position: "absolute",
          right: "16px",
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 20,
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          background: "rgba(10,10,10,0.6)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "#e5e5e5",
          fontSize: "22px",
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.2s ease, background 0.15s ease",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.background =
            "rgba(30,30,30,0.85)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.background =
            "rgba(10,10,10,0.6)")
        }
      >
        ›
      </button>

      {/* ── Dot indicators ────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            style={{
              height: "6px",
              // active dot stretches into a pill; inactive stays circular
              width: i === current ? "22px" : "6px",
              borderRadius: "3px",
              background:
                i === current ? "#e5e5e5" : "rgba(255,255,255,0.3)",
              border: "none",
              padding: 0,
              cursor: "pointer",
              transition: "width 0.3s ease, background 0.3s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
