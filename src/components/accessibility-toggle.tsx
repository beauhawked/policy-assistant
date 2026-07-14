"use client";

import { useEffect, useState } from "react";

type ContrastMode = "default" | "high";

const STORAGE_KEY = "a11y-contrast";

export function AccessibilityToggle() {
  const [mode, setMode] = useState<ContrastMode>("default");

  useEffect(() => {
    let saved: ContrastMode = "default";
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "high") {
        saved = "high";
      }
    } catch {
      // localStorage unavailable; keep default.
    }
    setMode(saved);
    document.documentElement.dataset.contrast = saved;
  }, []);

  const toggle = () => {
    const next: ContrastMode = mode === "high" ? "default" : "high";
    setMode(next);
    document.documentElement.dataset.contrast = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore persistence failures.
    }
  };

  const isOn = mode === "high";

  return (
    <button
      type="button"
      className="app-header-link a11y-toggle"
      onClick={toggle}
      aria-pressed={isOn}
      title="Toggle high-contrast mode"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
      </svg>
      High contrast: {isOn ? "On" : "Off"}
    </button>
  );
}
