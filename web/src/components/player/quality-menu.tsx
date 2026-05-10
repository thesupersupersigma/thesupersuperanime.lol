"use client";

import { useState } from "react";

interface QualityMenuProps {
  qualities: string[];
  selectedQuality: string;
  onSelect: (quality: string) => void;
}

export function QualityMenu({ qualities, selectedQuality, onSelect }: QualityMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (qualities.length <= 1) return null;

  return (
    <div style={{ position: "absolute", top: "16px", right: "16px", zIndex: 50 }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.2)",
          padding: "6px 12px",
          borderRadius: "4px",
          fontSize: "13px",
          cursor: "pointer",
          backdropFilter: "blur(4px)",
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
          background: "rgba(20,20,20,0.95)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "4px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minWidth: "120px"
        }}>
          {qualities.map(q => (
            <button
              key={q}
              onClick={() => {
                onSelect(q);
                setIsOpen(false);
              }}
              style={{
                background: q === selectedQuality ? "#3b82f6" : "transparent",
                color: "#fff",
                border: "none",
                padding: "10px 12px",
                textAlign: "left",
                fontSize: "13px",
                cursor: "pointer",
                fontWeight: q === selectedQuality ? 600 : 400
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
