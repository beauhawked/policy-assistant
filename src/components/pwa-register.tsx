"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
    };
  }
}

export function PwaRegister() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // Inside the native mobile shell, documents open in the app's own
    // reader page, which renders PDFs with full pinch-to-zoom and a Back
    // button. (The webview's inline PDF display cannot zoom reliably.)
    const onDocumentClick = (event: MouseEvent): void => {
      if (!window.Capacitor?.isNativePlatform?.()) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      if (anchor.origin !== window.location.origin) {
        return;
      }
      if (!/\.pdf($|[?#])/i.test(anchor.href)) {
        return;
      }
      event.preventDefault();
      window.location.href = `/reader?file=${encodeURIComponent(anchor.pathname)}`;
    };
    document.addEventListener("click", onDocumentClick, true);

    // iOS scrolls the webview when the keyboard appears and does not always
    // restore it afterward, leaving the header wedged under the status bar.
    // After editing ends, nudge the scroll position back to the top.
    const onFocusOut = (): void => {
      if (!window.Capacitor?.isNativePlatform?.()) {
        return;
      }
      window.setTimeout(() => {
        const active = document.activeElement;
        const stillEditing =
          active instanceof HTMLElement &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            active.isContentEditable);
        if (!stillEditing) {
          window.scrollTo(0, 0);
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        }
      }, 250);
    };
    document.addEventListener("focusout", onFocusOut, true);

    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      document.removeEventListener("focusout", onFocusOut, true);
    };
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failures are non-fatal; the app still works online.
      });
    }

    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) {
    return null;
  }

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 3l18 18" />
        <path d="M8.5 16.5a5 5 0 0 1 7 0" />
        <path d="M2 8.8A16 16 0 0 1 9 5.6" />
        <path d="M22 8.8a16 16 0 0 0-6-3.2" />
        <path d="M12 20h.01" />
      </svg>
      You&rsquo;re offline — new answers and sign-in need a connection.
    </div>
  );
}
