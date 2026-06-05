"use client";

import { useState } from "react";
import { useMediaState } from "@vidstack/react";

interface QualityMenuProps {
  qualities: string[];
  selectedQuality: string;
  onSelect: (quality: string) => void;
}

export function QualityMenu({ qualities, selectedQuality, onSelect }: QualityMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // THE FIX: Vidstack tells us if the mouse is moving and controls are visible!
  const controlsVisible = useMediaState('controlsVisible'); 

  if (!qualities || qualities.length <= 1) return null;

  return (
    <div style={{
      position: "absolute",
      top: "16px",
      right: "16px",
      zIndex: 50,
      // Fade out and disable clicks when controls disappear
      opacity: controlsVisible ? 1 : 0,
      visibility: controlsVisible ? "visible" : "hidden",
      transition: "opacity 0.2s ease-in-out, visibility 0.2s ease-in-out"
    }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: "rgba(0, 0, 0, 0.6)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.2)",
          padding: "6px 12px",
          borderRadius: "4px",
          cursor: "pointer",
          backdropFilter: "blur(4px)",
          fontSize: "13px",
          fontWeight: 500
        }}
      >
        Quality: {selectedQuality} ▾
      </button>

      {isOpen && (
        <div style={{
          position: "absolute",
          top: "100%",
          right: 0,
          marginTop: "4px",
          background: "rgba(0, 0, 0, 0.8)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "4px",
          display: "flex",
          flexDirection: "column",
          minWidth: "100px",
          overflow: "hidden",
          backdropFilter: "blur(8px)"
        }}>
          {qualities.map((q, i) => (
            <button
              key={`${q}-${i}`}
              onClick={() => {
                onSelect(q);
                setIsOpen(false);
              }}
              style={{
                background: selectedQuality === q ? "rgba(59, 130, 246, 0.5)" : "transparent",
                color: selectedQuality === q ? "#fff" : "#ccc",
                border: "none",
                padding: "8px 12px",
                textAlign: "left",
                cursor: "pointer",
                fontSize: "13px",
                transition: "background 0.1s"
              }}
              onMouseEnter={(e) => {
                if (selectedQuality !== q) e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              }}
              onMouseLeave={(e) => {
                if (selectedQuality !== q) e.currentTarget.style.background = "transparent";
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}