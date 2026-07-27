"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

/**
 * In-app document reader.
 *
 * Renders a same-origin PDF page by page onto canvases inside the app's own
 * chrome, so documents never leave Policy to Action. Zoom is implemented by
 * the reader itself (pinch, double-tap, and header buttons) because the
 * native webview refuses page-level zoom regardless of viewport settings.
 * Pages render lazily as they approach the viewport to bound memory use.
 */

const APP_ROUTE = "/policy-assistant";
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function titleFromPath(path: string): string {
  const name = decodeURIComponent(path.split("/").pop() ?? "");
  return name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").replace(/^Policy to Action /i, "");
}

function touchDistance(touches: TouchList): number {
  return Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  );
}

function ReaderInner() {
  const params = useSearchParams();
  const router = useRouter();
  const rawFile = params.get("file") ?? "";
  // Only same-origin absolute paths to PDF files are permitted.
  const file =
    rawFile.startsWith("/") && !rawFile.startsWith("//") && /\.pdf($|[?#])/i.test(rawFile)
      ? rawFile
      : "";

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [error, setError] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  /** Set the zoom level, keeping the given viewport point visually fixed. */
  const applyZoom = useCallback((next: number, centerX?: number, centerY?: number): void => {
    const scroller = scrollRef.current;
    const pages = pagesRef.current;
    if (!scroller || !pages) {
      return;
    }
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const previous = zoomRef.current;
    if (Math.abs(clamped - previous) < 0.001) {
      return;
    }
    const rect = scroller.getBoundingClientRect();
    const anchorX = centerX ?? rect.width / 2;
    const anchorY = centerY ?? rect.height / 2;
    const ratio = clamped / previous;
    const nextScrollLeft = (scroller.scrollLeft + anchorX) * ratio - anchorX;
    const nextScrollTop = (scroller.scrollTop + anchorY) * ratio - anchorY;
    zoomRef.current = clamped;
    pages.style.width = `${clamped * 100}%`;
    pages.style.maxWidth = clamped > 1.001 ? "none" : "";
    scroller.scrollLeft = nextScrollLeft;
    scroller.scrollTop = nextScrollTop;
    setZoomPercent(Math.round(clamped * 100));
  }, []);

  /* Pinch and double-tap gestures, handled by the reader itself. */
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) {
      return;
    }
    let pinchStartDistance = 0;
    let pinchStartZoom = 1;
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    const onTouchStart = (event: TouchEvent): void => {
      if (event.touches.length === 2) {
        pinchStartDistance = touchDistance(event.touches);
        pinchStartZoom = zoomRef.current;
      }
    };

    const onTouchMove = (event: TouchEvent): void => {
      if (event.touches.length === 2 && pinchStartDistance > 0) {
        event.preventDefault();
        const rect = scroller.getBoundingClientRect();
        const centerX =
          (event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left;
        const centerY =
          (event.touches[0].clientY + event.touches[1].clientY) / 2 - rect.top;
        const nextZoom = pinchStartZoom * (touchDistance(event.touches) / pinchStartDistance);
        applyZoom(nextZoom, centerX, centerY);
      }
    };

    const onTouchEnd = (event: TouchEvent): void => {
      if (event.touches.length < 2) {
        pinchStartDistance = 0;
      }
      if (event.changedTouches.length === 1 && event.touches.length === 0) {
        const now = Date.now();
        const touch = event.changedTouches[0];
        const isDoubleTap =
          now - lastTapTime < 300 &&
          Math.abs(touch.clientX - lastTapX) < 40 &&
          Math.abs(touch.clientY - lastTapY) < 40;
        if (isDoubleTap) {
          const rect = scroller.getBoundingClientRect();
          applyZoom(
            zoomRef.current > 1.05 ? 1 : 2.2,
            touch.clientX - rect.left,
            touch.clientY - rect.top,
          );
          lastTapTime = 0;
        } else {
          lastTapTime = now;
          lastTapX = touch.clientX;
          lastTapY = touch.clientY;
        }
      }
    };

    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    scroller.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchend", onTouchEnd);
    };
  }, [applyZoom]);

  useEffect(() => {
    if (!file) {
      setError("This document link is not valid.");
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    let observer: IntersectionObserver | null = null;

    const load = async (): Promise<void> => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ url: file }).promise;
        if (cancelled) {
          return;
        }
        setPageCount(doc.numPages);
        setIsLoading(false);

        const container = pagesRef.current;
        if (!container) {
          return;
        }
        const firstPage = await doc.getPage(1);
        const firstViewport = firstPage.getViewport({ scale: 1 });
        const defaultRatio = firstViewport.width / firstViewport.height;

        const renderPage = async (slot: HTMLElement, pageNumber: number): Promise<void> => {
          try {
            const page = await doc.getPage(pageNumber);
            if (cancelled) {
              return;
            }
            const base = page.getViewport({ scale: 1 });
            slot.style.aspectRatio = `${base.width} / ${base.height}`;
            const cssWidth = slot.clientWidth || container.clientWidth;
            const scale = cssWidth / base.width;
            // Render at up to 3x the CSS size so zooming stays sharp
            // without exhausting canvas memory on long documents.
            const outputScale = Math.min(window.devicePixelRatio || 1, 3);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.className = "piq-reader-canvas";
            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);
            await page.render({
              canvas,
              viewport,
              transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
            }).promise;
            if (cancelled) {
              return;
            }
            slot.replaceChildren(canvas);
            slot.classList.add("is-rendered");
          } catch {
            slot.classList.add("is-failed");
            slot.textContent = "This page could not be displayed.";
          }
        };

        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) {
                continue;
              }
              const slot = entry.target as HTMLElement;
              observer?.unobserve(slot);
              const pageNumber = Number(slot.dataset.page ?? "0");
              if (pageNumber > 0) {
                void renderPage(slot, pageNumber);
              }
            }
          },
          // Begin rendering well before a page scrolls into view.
          { root: scrollRef.current, rootMargin: "150% 0px" },
        );

        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          const slot = document.createElement("div");
          slot.className = "piq-reader-slot";
          slot.dataset.page = String(pageNumber);
          slot.style.aspectRatio = `${defaultRatio}`;
          slot.setAttribute("aria-label", `Page ${pageNumber} of ${doc.numPages}`);
          container.appendChild(slot);
          observer.observe(slot);
        }
      } catch {
        if (!cancelled) {
          setError("This document could not be loaded. Check your connection and try again.");
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [file]);

  const handleBack = (): void => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(APP_ROUTE);
    }
  };

  return (
    <div className="piq-reader">
      <header className="piq-reader-head">
        <button type="button" className="piq-reader-back" onClick={handleBack}>
          <span aria-hidden="true">←</span> Back
        </button>
        <Image src="/logo-icon.png" alt="" width={24} height={20} className="piq-reader-logo" />
        <span className="piq-reader-title">{file ? titleFromPath(file) : "Document"}</span>
        <div className="piq-reader-zoom" role="group" aria-label="Zoom">
          <button
            type="button"
            className="piq-reader-zoom-button"
            aria-label="Zoom out"
            onClick={() => applyZoom(zoomRef.current - 0.5)}
          >
            −
          </button>
          <button
            type="button"
            className="piq-reader-zoom-level"
            aria-label="Reset zoom"
            onClick={() => applyZoom(1)}
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            className="piq-reader-zoom-button"
            aria-label="Zoom in"
            onClick={() => applyZoom(zoomRef.current + 0.5)}
          >
            +
          </button>
        </div>
      </header>
      <div ref={scrollRef} className="piq-reader-body">
        {isLoading ? <p className="piq-reader-status">Loading document…</p> : null}
        {error ? <p className="piq-reader-status is-error">{error}</p> : null}
        <div ref={pagesRef} className="piq-reader-pages" />
        {pageCount > 0 ? (
          <p className="piq-reader-status is-count">
            {pageCount} {pageCount === 1 ? "page" : "pages"}. Pinch or double-tap to zoom.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={<div className="piq-reader" />}>
      <ReaderInner />
    </Suspense>
  );
}
