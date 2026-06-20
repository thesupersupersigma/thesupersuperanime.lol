"use client";

import { useEffect, useRef, useState } from "react";

// Each cheat code maps a key-code sequence to the video it plays.
const CODES: { code: string; sequence: string[]; src: string }[] = [
  {
    code: "KONAMI",
    sequence: [
      "ArrowUp",
      "ArrowUp",
      "ArrowDown",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowLeft",
      "ArrowRight",
      "KeyB",
      "KeyA",
    ],
    src: "/KONAMI.mp4",
  },
  {
    code: "IDDQD",
    sequence: ["KeyI", "KeyD", "KeyD", "KeyQ", "KeyD"],
    src: "/IDDQD.mp4",
  },
  {
    code: "IDKFA",
    sequence: ["KeyI", "KeyD", "KeyK", "KeyF", "KeyA"],
    src: "/IDKFA.mp4",
  },
  {
    code: "ABACABB",
    sequence: ["KeyA", "KeyB", "KeyA", "KeyC", "KeyA", "KeyB", "KeyB"],
    src: "/ABACABB.mp4",
  },
];

function endsWith(buffer: string[], sequence: string[]): boolean {
  if (buffer.length < sequence.length) return false;
  const start = buffer.length - sequence.length;
  for (let i = 0; i < sequence.length; i++) {
    if (buffer[start + i] !== sequence[i]) return false;
  }
  return true;
}

export function EasterEggs() {
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const bufferRef = useRef<string[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Global cheat-code listener — runs once for the lifetime of the component.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const buffer = bufferRef.current;
      buffer.push(e.code);
      if (buffer.length > 20) buffer.shift();

      for (const { code, sequence, src } of CODES) {
        if (endsWith(buffer, sequence)) {
          console.log("[easter-egg] triggered:", code);
          bufferRef.current = [];
          setActiveVideo(src);
          break;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // While a video is playing, swallow every key (Escape, F11, etc.) so there's no escape.
  useEffect(() => {
    if (!activeVideo) return;

    function blockKey(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
    }

    document.addEventListener("keydown", blockKey, true);
    overlayRef.current?.focus();
    return () => document.removeEventListener("keydown", blockKey, true);
  }, [activeVideo]);

  if (!activeVideo) return null;

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      onKeyDown={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "black",
        outline: "none",
        animation: "easter-egg-in 400ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
      }}
    >
      <style>{`
        @keyframes easter-egg-in {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <video
        src={activeVideo}
        autoPlay
        muted={false}
        onEnded={() => setActiveVideo(null)}
        onContextMenu={(e) => e.preventDefault()}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </div>
  );
}
