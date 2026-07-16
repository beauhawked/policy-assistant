"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

type ContrastMode = "default" | "high";

const STORAGE_KEY = "a11y-contrast";

/**
 * The saved contrast preference lives in localStorage (an external system),
 * so we subscribe to it with useSyncExternalStore: the server snapshot is
 * always "default" (matching the server-rendered HTML), and the client
 * snapshot reads the stored preference after hydration.
 */

let contrastListeners: Array<() => void> = [];

function readStoredMode(): ContrastMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "high" ? "high" : "default";
  } catch {
    return "default";
  }
}

function subscribeToContrast(listener: () => void): () => void {
  contrastListeners.push(listener);
  return () => {
    contrastListeners = contrastListeners.filter((item) => item !== listener);
  };
}

function writeStoredMode(next: ContrastMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Ignore persistence failures.
  }
  document.documentElement.dataset.contrast = next;
  for (const listener of contrastListeners) {
    listener();
  }
}

export function AccessibilityToggle() {
  const mode = useSyncExternalStore<ContrastMode>(
    subscribeToContrast,
    readStoredMode,
    () => "default",
  );

  // Keep the document attribute in sync with the resolved mode. Updating an
  // external system (the DOM) from an effect is exactly what effects are for.
  useEffect(() => {
    document.documentElement.dataset.contrast = mode;
  }, [mode]);

  const toggle = useCallback(() => {
    writeStoredMode(readStoredMode() === "high" ? "default" : "high");
  }, []);

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
