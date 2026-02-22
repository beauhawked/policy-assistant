"use client";

import { FormEvent, useMemo, useState } from "react";

interface ExportSummary {
  policyCount: number;
  bookCount: number;
  failedCount: number;
  filename: string;
}

const DEFAULT_DISTRICT_URL = "https://go.boarddocs.com/in/blm/Board.nsf/Public";

export function PolicyScraperPanel() {
  const [districtUrl, setDistrictUrl] = useState(DEFAULT_DISTRICT_URL);
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
      setErrorMessage("Please enter a district BoardDocs URL.");
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

      const policyCount = Number(response.headers.get("x-policy-count") ?? "0");
      const bookCount = Number(response.headers.get("x-book-count") ?? "0");
      const failedCount = Number(response.headers.get("x-failed-count") ?? "0");

      setSummary({
        policyCount: Number.isFinite(policyCount) ? policyCount : 0,
        bookCount: Number.isFinite(bookCount) ? bookCount : 0,
        failedCount: Number.isFinite(failedCount) ? failedCount : 0,
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

  return (
    <section className="panel policy-scraper-panel">
      <form className="policy-scrape-form" onSubmit={handleSubmit}>
        <label htmlFor="district-url" className="policy-label">
          District BoardDocs URL
        </label>
        <input
          id="district-url"
          type="url"
          value={districtUrl}
          onChange={(event) => setDistrictUrl(event.target.value)}
          placeholder="https://go.boarddocs.com/in/blm/Board.nsf/Public"
          required
        />

        <label className="policy-checkbox">
          <input
            type="checkbox"
            checked={includeAllBooks}
            onChange={(event) => setIncludeAllBooks(event.target.checked)}
          />
          Include all books (not only policy/bylaw books)
        </label>

        <button className="action-button policy-button" type="submit" disabled={isScraping}>
          {buttonLabel}
        </button>
      </form>

      {statusMessage ? <p className="policy-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="policy-error">{errorMessage}</p> : null}

      {summary ? (
        <div className="policy-success">
          <p>
            Exported <strong>{summary.policyCount}</strong> policies from <strong>{summary.bookCount}</strong> book(s).
          </p>
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
    return "boarddocs-policies.csv";
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (basicMatch?.[1]) {
    return basicMatch[1];
  }

  return "boarddocs-policies.csv";
}

function triggerDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
