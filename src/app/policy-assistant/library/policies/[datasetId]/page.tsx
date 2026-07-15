"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface LibraryDataset {
  id: string;
  title: string;
  districtName: string;
  filename: string;
  uploadedAt: string;
  policyCount: number;
}

interface LibraryPolicy {
  id: number;
  policySection: string;
  policyCode: string;
  adoptedDate: string;
  revisedDate: string;
  policyStatus: string;
  policyTitle: string;
  policyWording: string;
}

interface PolicySectionGroup {
  section: string;
  anchor: string;
  policies: LibraryPolicy[];
}

export default function PolicyLibraryPage() {
  const params = useParams<{ datasetId: string }>();
  const datasetId = params?.datasetId ?? "";

  const [dataset, setDataset] = useState<LibraryDataset | null>(null);
  const [policies, setPolicies] = useState<LibraryPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!datasetId) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(
          `/api/policy-assistant/datasets/${encodeURIComponent(datasetId)}/policies`,
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
              : "Could not load the policy library.",
          );
          setIsLoading(false);
          return;
        }

        setDataset(payload.dataset ?? null);
        setPolicies(Array.isArray(payload.policies) ? payload.policies : []);
        setIsLoading(false);
      } catch {
        if (!cancelled) {
          setLoadError("Could not load the policy library. Please check your connection.");
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  const filteredPolicies = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) {
      return policies;
    }
    return policies.filter((policy) =>
      [policy.policyCode, policy.policyTitle, policy.policySection, policy.policyWording]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [policies, filter]);

  const sectionGroups = useMemo<PolicySectionGroup[]>(() => {
    const groups = new Map<string, LibraryPolicy[]>();
    for (const policy of filteredPolicies) {
      const section = policy.policySection.trim() || "Uncategorized";
      const existing = groups.get(section);
      if (existing) {
        existing.push(policy);
      } else {
        groups.set(section, [policy]);
      }
    }
    return Array.from(groups.entries()).map(([section, sectionPolicies], index) => ({
      section,
      anchor: `section-${index}-${section.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      policies: sectionPolicies,
    }));
  }, [filteredPolicies]);

  function handleDownloadMarkdown(): void {
    if (!dataset) {
      return;
    }

    const lines: string[] = [];
    lines.push(`# ${dataset.title}`);
    lines.push("");
    lines.push(`District: ${dataset.districtName}`);
    lines.push(`Policies: ${policies.length}`);
    lines.push(`Exported: ${new Date().toLocaleString()}`);
    lines.push("");

    const groups = new Map<string, LibraryPolicy[]>();
    for (const policy of policies) {
      const section = policy.policySection.trim() || "Uncategorized";
      const existing = groups.get(section);
      if (existing) {
        existing.push(policy);
      } else {
        groups.set(section, [policy]);
      }
    }

    for (const [section, sectionPolicies] of groups.entries()) {
      lines.push(`## ${section}`);
      lines.push("");
      for (const policy of sectionPolicies) {
        lines.push(`### ${policy.policyCode || "No code"} — ${policy.policyTitle || "Untitled"}`);
        lines.push("");
        const meta: string[] = [];
        if (policy.policyStatus) meta.push(`Status: ${policy.policyStatus}`);
        if (policy.adoptedDate) meta.push(`Adopted: ${policy.adoptedDate}`);
        if (policy.revisedDate) meta.push(`Revised: ${policy.revisedDate}`);
        if (meta.length > 0) {
          lines.push(meta.join(" | "));
          lines.push("");
        }
        lines.push(policy.policyWording || "(No policy text)");
        lines.push("");
      }
    }

    downloadTextFile(
      `${slugify(dataset.title)}-policies.md`,
      lines.join("\n"),
    );
  }

  return (
    <main className="library-page">
      <header className="library-header">
        <div>
          <Link href="/policy-assistant" className="library-back-link">
            &larr; Back to Assistant
          </Link>
          <h1>{dataset ? dataset.title : "Policy Library"}</h1>
          {dataset ? (
            <p className="library-subtitle">
              {dataset.districtName} | {policies.length} policies | Imported{" "}
              {new Date(dataset.uploadedAt).toLocaleDateString()}
            </p>
          ) : null}
        </div>
        <div className="library-actions">
          <button type="button" onClick={handleDownloadMarkdown} disabled={!dataset}>
            Download Markdown
          </button>
          <button type="button" onClick={() => window.print()} disabled={!dataset}>
            Print
          </button>
        </div>
      </header>

      {isLoading ? <p className="library-status">Loading the full policy library...</p> : null}

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
          <aside className="library-toc" aria-label="Policy sections">
            <label htmlFor="library-filter" className="library-filter-label">
              Filter policies
            </label>
            <input
              id="library-filter"
              type="search"
              placeholder="Search code, title, or text..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            <p className="library-toc-title">Sections</p>
            <ul>
              {sectionGroups.map((group) => (
                <li key={group.anchor}>
                  <a href={`#${group.anchor}`}>
                    {group.section} ({group.policies.length})
                  </a>
                </li>
              ))}
            </ul>
          </aside>

          <div className="library-content">
            {sectionGroups.length === 0 ? (
              <p className="library-status">
                {filter
                  ? "No policies match your filter."
                  : "This dataset does not contain any policies."}
              </p>
            ) : (
              sectionGroups.map((group) => (
                <section key={group.anchor} id={group.anchor} className="library-section">
                  <h2>{group.section}</h2>
                  {group.policies.map((policy) => (
                    <article key={policy.id} className="library-policy">
                      <h3>
                        {policy.policyCode ? <span>{policy.policyCode}</span> : null}
                        {policy.policyTitle || "Untitled Policy"}
                      </h3>
                      <p className="library-policy-meta">
                        {[
                          policy.policyStatus ? `Status: ${policy.policyStatus}` : "",
                          policy.adoptedDate ? `Adopted: ${policy.adoptedDate}` : "",
                          policy.revisedDate
                            ? `Revised: ${policy.revisedDate}`
                            : "No revisions recorded",
                        ]
                          .filter(Boolean)
                          .join(" | ")}
                      </p>
                      <div className="library-policy-text">
                        {splitParagraphs(policy.policyWording).map((paragraph, index) => (
                          <p key={index}>{paragraph}</p>
                        ))}
                      </div>
                    </article>
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
  return paragraphs.length > 0 ? paragraphs : ["(No policy text)"];
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "policy-library"
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
