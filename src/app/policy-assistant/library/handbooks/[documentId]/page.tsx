"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface LibraryHandbookDocument {
  id: string;
  title: string;
  districtName: string;
  filename: string;
  uploadedAt: string;
  chunkCount: number;
  handbookType: "student" | "staff";
}

interface LibraryHandbookChunk {
  id: number;
  sectionTitle: string;
  content: string;
  sourceIndex: number;
}

interface HandbookSectionGroup {
  title: string;
  anchor: string;
  chunks: LibraryHandbookChunk[];
}

export default function HandbookLibraryPage() {
  const params = useParams<{ documentId: string }>();
  const documentId = params?.documentId ?? "";

  const [handbook, setHandbook] = useState<LibraryHandbookDocument | null>(null);
  const [chunks, setChunks] = useState<LibraryHandbookChunk[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!documentId) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(
          `/api/policy-assistant/handbooks/${encodeURIComponent(documentId)}/content`,
          { cache: "no-store" },
        );
        const payload = await response.json().catch(() => ({}));

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setLoadError(
            typeof payload.error === "string"
              ? payload.error
              : "Could not load the handbook content.",
          );
          setIsLoading(false);
          return;
        }

        setHandbook(payload.document ?? null);
        setChunks(Array.isArray(payload.chunks) ? payload.chunks : []);
        setIsLoading(false);
      } catch {
        if (!cancelled) {
          setLoadError("Could not load the handbook. Please check your connection.");
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const sectionGroups = useMemo<HandbookSectionGroup[]>(() => {
    const query = filter.trim().toLowerCase();
    const visible = query
      ? chunks.filter((chunk) =>
          `${chunk.sectionTitle} ${chunk.content}`.toLowerCase().includes(query),
        )
      : chunks;

    // Group consecutive chunks that share a section title so the handbook
    // reads as continuous sections rather than fragmented excerpts.
    const groups: HandbookSectionGroup[] = [];
    for (const chunk of visible) {
      const title = chunk.sectionTitle.trim() || "General Content";
      const previous = groups[groups.length - 1];
      if (previous && previous.title === title) {
        previous.chunks.push(chunk);
      } else {
        groups.push({
          title,
          anchor: `hb-${groups.length}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          chunks: [chunk],
        });
      }
    }
    return groups;
  }, [chunks, filter]);

  function handleDownloadMarkdown(): void {
    if (!handbook) {
      return;
    }

    const lines: string[] = [];
    lines.push(`# ${handbook.title}`);
    lines.push("");
    lines.push(
      `${handbook.handbookType === "staff" ? "Staff" : "Student"} Handbook | District: ${handbook.districtName}`,
    );
    lines.push(`Source file: ${handbook.filename}`);
    lines.push(`Exported: ${new Date().toLocaleString()}`);
    lines.push("");

    let previousTitle = "";
    for (const chunk of chunks) {
      const title = chunk.sectionTitle.trim() || "General Content";
      if (title !== previousTitle) {
        lines.push(`## ${title}`);
        lines.push("");
        previousTitle = title;
      }
      lines.push(chunk.content.trim());
      lines.push("");
    }

    downloadTextFile(`${slugify(handbook.title)}-handbook.md`, lines.join("\n"));
  }

  return (
    <main className="library-page">
      <header className="library-header">
        <div>
          <Link href="/policy-assistant" className="library-back-link">
            &larr; Back to Assistant
          </Link>
          <h1>{handbook ? handbook.title : "Handbook"}</h1>
          {handbook ? (
            <p className="library-subtitle">
              {handbook.handbookType === "staff" ? "Staff Handbook" : "Student Handbook"} |{" "}
              {handbook.districtName} | Uploaded{" "}
              {new Date(handbook.uploadedAt).toLocaleDateString()} | Source: {handbook.filename}
            </p>
          ) : null}
        </div>
        <div className="library-actions">
          <button type="button" onClick={handleDownloadMarkdown} disabled={!handbook}>
            Download Markdown
          </button>
          <button type="button" onClick={() => window.print()} disabled={!handbook}>
            Print
          </button>
        </div>
      </header>

      {isLoading ? <p className="library-status">Loading the full handbook...</p> : null}

      {loadError ? (
        <div className="library-error">
          <p>{loadError}</p>
          <p>
            <Link href="/policy-assistant">Return to the assistant to sign in.</Link>
          </p>
        </div>
      ) : null}

      {!isLoading && !loadError ? (
        <div className="library-body">
          <aside className="library-toc" aria-label="Handbook sections">
            <label htmlFor="library-filter" className="library-filter-label">
              Filter handbook
            </label>
            <input
              id="library-filter"
              type="search"
              placeholder="Search sections or text..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            <p className="library-toc-title">Sections</p>
            <ul>
              {sectionGroups.map((group) => (
                <li key={group.anchor}>
                  <a href={`#${group.anchor}`}>{group.title}</a>
                </li>
              ))}
            </ul>
          </aside>

          <div className="library-content">
            {sectionGroups.length === 0 ? (
              <p className="library-status">
                {filter
                  ? "No handbook sections match your filter."
                  : "This handbook does not contain any extracted content."}
              </p>
            ) : (
              sectionGroups.map((group) => (
                <section key={group.anchor} id={group.anchor} className="library-section">
                  <h2>{group.title}</h2>
                  {group.chunks.map((chunk) => (
                    <div key={chunk.id} className="library-policy-text">
                      {splitParagraphs(chunk.content).map((paragraph, index) => (
                        <p key={index}>{paragraph}</p>
                      ))}
                    </div>
                  ))}
                </section>
              ))
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function splitParagraphs(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}|\r\n{2,}/)
    .flatMap((block) => block.split(/\n/))
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return paragraphs.length > 0 ? paragraphs : ["(No content)"];
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "handbook"
  );
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
