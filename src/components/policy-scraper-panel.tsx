"use client";

import { FormEvent, useMemo, useState } from "react";

type PolicyPlatform = "auto" | "boarddocs" | "table-link";
type ResolvedPolicyPlatform = Exclude<PolicyPlatform, "auto">;

interface ExportSummary {
  policyCount: number;
  sourceCount: number;
  sourceLabel: string;
  failedCount: number;
  platform: ResolvedPolicyPlatform;
  filename: string;
}

const DEFAULT_DISTRICT_URL = "https://go.boarddocs.com/in/blm/Board.nsf/Public";

export function PolicyScraperPanel() {
  const [districtUrl, setDistrictUrl] = useState(DEFAULT_DISTRICT_URL);
  const [platform, setPlatform] = useState<PolicyPlatform>("auto");
  const [includeAllBooks, setIncludeAllBooks] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [summary, setSummary] = useState<ExportSummary | null>(null);

  const buttonLabel = useMemo(
    () => (isScraping ? "Scraping Policies..." : "Scrape Policies and Download CSV"),
    [isScraping],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!districtUrl.trim()) {
      setErrorMessage("Please enter a district policy URL.");
      return;
    }

    setIsScraping(true);
    setErrorMessage("");
    setSummary(null);
    setStatusMessage("Scraping in progress. This can take a minute for large policy manuals.");

    try {
      const response = await fetch("/api/policies/export", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          url: districtUrl,
          platform,
          includeAllBooks,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? `Export failed with status ${response.status}.`);
        }

        const fallbackText = (await response.text().catch(() => "")).trim();
        throw new Error(fallbackText || `Export failed with status ${response.status}.`);
      }

      const csvBlob = await response.blob();
      const filename = parseFilenameFromDisposition(response.headers.get("content-disposition"));
      triggerDownload(csvBlob, filename);

      const platformFromHeader = parseResolvedPlatform(response.headers.get("x-platform"));
      const policyCount = Number(response.headers.get("x-policy-count") ?? "0");
      const sourceCount = Number(
        response.headers.get("x-source-count") ?? response.headers.get("x-book-count") ?? "0",
      );
      const failedCount = Number(response.headers.get("x-failed-count") ?? "0");
      const sourceLabel =
        (response.headers.get("x-source-label") ?? "").trim() ||
        (platformFromHeader === "table-link" ? "policy link(s)" : "book(s)");

      setSummary({
        policyCount: Number.isFinite(policyCount) ? policyCount : 0,
        sourceCount: Number.isFinite(sourceCount) ? sourceCount : 0,
        sourceLabel,
        failedCount: Number.isFinite(failedCount) ? failedCount : 0,
        platform: platformFromHeader,
        filename,
      });
      setStatusMessage("Scrape complete. Your CSV download has been generated.");
    } catch (error) {
      setStatusMessage("");
      setErrorMessage(error instanceof Error ? error.message : "Policy export failed.");
    } finally {
      setIsScraping(false);
    }
  };

  const urlLabel =
    platform === "table-link" ? "District Policy Listing URL" : "District Policy URL";
  const urlPlaceholder =
    platform === "boarddocs"
      ? "https://go.boarddocs.com/in/blm/Board.nsf/Public"
      : platform === "table-link"
        ? "https://www.sarasotacountyschools.net/page/school-board-policies"
        : "https://go.boarddocs.com/... or https://district-site.org/page/policies";

  return (
    <section className="panel policy-scraper-panel">
      <form className="policy-scrape-form" onSubmit={handleSubmit}>
        <label htmlFor="policy-platform" className="policy-label">
          Policy Platform
        </label>
        <select
          id="policy-platform"
          value={platform}
          onChange={(event) => setPlatform(event.target.value as PolicyPlatform)}
        >
          <option value="auto">Auto-detect</option>
          <option value="boarddocs">BoardDocs</option>
          <option value="table-link">Table-based (Sarasota-style)</option>
        </select>

        <label htmlFor="district-url" className="policy-label">
          {urlLabel}
        </label>
        <input
          id="district-url"
          type="url"
          value={districtUrl}
          onChange={(event) => setDistrictUrl(event.target.value)}
          placeholder={urlPlaceholder}
          required
        />

        {platform !== "table-link" ? (
          <label className="policy-checkbox">
            <input
              type="checkbox"
              checked={includeAllBooks}
              onChange={(event) => setIncludeAllBooks(event.target.checked)}
            />
            Include all books (not only policy/bylaw books)
          </label>
        ) : null}

        <button className="action-button policy-button" type="submit" disabled={isScraping}>
          {buttonLabel}
        </button>
      </form>

      {statusMessage ? <p className="policy-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="policy-error">{errorMessage}</p> : null}

      {summary ? (
        <div className="policy-success">
          <p>
            Exported <strong>{summary.policyCount}</strong> policies from{" "}
            <strong>{summary.sourceCount}</strong> {summary.sourceLabel}.
          </p>
          <p className="small-muted">Platform: {formatPlatform(summary.platform)}</p>
          <p className="small-muted">File: {summary.filename}</p>
          {summary.failedCount > 0 ? (
            <p className="small-muted">
              {summary.failedCount} policy item(s) failed during scrape and were skipped.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function parseFilenameFromDisposition(contentDisposition: string | null): string {
  if (!contentDisposition) {
    return "district-policies.csv";
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (basicMatch?.[1]) {
    return basicMatch[1];
  }

  return "district-policies.csv";
}

function parseResolvedPlatform(value: string | null): ResolvedPolicyPlatform {
  return value === "table-link" ? "table-link" : "boarddocs";
}

function formatPlatform(platform: ResolvedPolicyPlatform): string {
  return platform === "table-link" ? "Table-based (Sarasota-style)" : "BoardDocs";
}

function triggerDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
