"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/**
 * In-app document reader.
 *
 * Renders a same-origin PDF page by page onto canvases inside the app's own
 * chrome, so documents never leave Policy to Action. Pinch-to-zoom works
 * because this is an ordinary HTML page (unlike the webview's inline PDF
 * display, which cannot zoom reliably on iOS). Pages render lazily as they
 * approach the viewport to keep memory in check on large documents.
 */

const APP_ROUTE = "/policy-assistant";

function titleFromPath(path: string): string {
  const name = decodeURIComponent(path.split("/").pop() ?? "");
  return name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").replace(/^Policy to Action /i, "");
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

  const pagesRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

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
            // Render at up to 3x the CSS size so pinch-zooming stays sharp
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
          { rootMargin: "150% 0px" },
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
      </header>
      <main className="piq-reader-body">
        {isLoading ? <p className="piq-reader-status">Loading document…</p> : null}
        {error ? <p className="piq-reader-status is-error">{error}</p> : null}
        <div ref={pagesRef} className="piq-reader-pages" />
        {pageCount > 0 ? (
          <p className="piq-reader-status is-count">
            {pageCount} {pageCount === 1 ? "page" : "pages"}. Pinch or double-tap to zoom.
          </p>
        ) : null}
      </main>
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
