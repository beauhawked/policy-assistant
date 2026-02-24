import { NextRequest, NextResponse } from "next/server";

import {
  accordionPdfPolicyRowsToCsv,
  isAccordionPdfPolicyListingHtml,
  scrapeAccordionPdfPolicies,
} from "@/lib/accordion-pdf-policy-scraper";
import { policyRowsToCsv, scrapeBoardDocsPolicies } from "@/lib/boarddocs-policy-scraper";
import {
  isTableLinkedPolicyListingHtml,
  scrapeTableLinkedPolicies,
  tableLinkedPolicyRowsToCsv,
} from "@/lib/table-link-policy-scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type RequestedPolicyPlatform = "auto" | "boarddocs" | "table-link" | "accordion-pdf";
type ResolvedPolicyPlatform = Exclude<RequestedPolicyPlatform, "auto">;

interface ExportPoliciesPayload {
  url?: string;
  includeAllBooks?: boolean;
  platform?: RequestedPolicyPlatform;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json().catch(() => ({}))) as ExportPoliciesPayload;
    const sourceUrl = payload.url?.trim() ?? "";
    const requestedPlatform = normalizeRequestedPlatform(payload.platform);

    if (!sourceUrl) {
      return NextResponse.json(
        { error: "Please provide a district policy URL." },
        { status: 400 },
      );
    }

    const normalizedSourceUrl = ensureUrlProtocol(sourceUrl);
    const resolvedPlatform = await resolvePolicyPlatform(normalizedSourceUrl, requestedPlatform);

    let csv = "";
    let baseUrl = normalizedSourceUrl;
    let policyCount = 0;
    let sourceCount = 0;
    let sourceLabel = "";
    let failedCount = 0;
    let legacyBookCount = 0;

    if (resolvedPlatform === "boarddocs") {
      const result = await scrapeBoardDocsPolicies({
        sourceUrl: normalizedSourceUrl,
        includeAllBooks: Boolean(payload.includeAllBooks),
        concurrency: 6,
      });

      csv = policyRowsToCsv(result.rows);
      baseUrl = result.baseUrl;
      policyCount = result.rows.length;
      sourceCount = result.selectedBooks.length;
      sourceLabel = "book(s)";
      failedCount = result.failedItems.length;
      legacyBookCount = result.selectedBooks.length;
    } else if (resolvedPlatform === "table-link") {
      const result = await scrapeTableLinkedPolicies({
        sourceUrl: normalizedSourceUrl,
        concurrency: 6,
      });

      csv = tableLinkedPolicyRowsToCsv(result.rows);
      baseUrl = result.listingUrl;
      policyCount = result.rows.length;
      sourceCount = result.discoveredPolicyLinks;
      sourceLabel = "policy link(s)";
      failedCount = result.failedItems.length;
      legacyBookCount = 0;
    } else {
      const result = await scrapeAccordionPdfPolicies({
        sourceUrl: normalizedSourceUrl,
        concurrency: 4,
      });

      csv = accordionPdfPolicyRowsToCsv(result.rows);
      baseUrl = result.listingUrl;
      policyCount = result.rows.length;
      sourceCount = result.discoveredPolicyLinks;
      sourceLabel = "policy PDF(s)";
      failedCount = result.failedItems.length;
      legacyBookCount = 0;
    }

    const filename = buildCsvFilename(baseUrl, resolvedPlatform);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
        "x-policy-count": String(policyCount),
        "x-failed-count": String(failedCount),
        "x-source-count": String(sourceCount),
        "x-source-label": sourceLabel,
        "x-platform": resolvedPlatform,
        "x-book-count": String(legacyBookCount),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Policy export failed.",
      },
      { status: 500 },
    );
  }
}

function normalizeRequestedPlatform(value: string | undefined): RequestedPolicyPlatform {
  if (value === "boarddocs" || value === "table-link" || value === "accordion-pdf") {
    return value;
  }
  return "auto";
}

function ensureUrlProtocol(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

async function resolvePolicyPlatform(
  sourceUrl: string,
  requestedPlatform: RequestedPolicyPlatform,
): Promise<ResolvedPolicyPlatform> {
  if (requestedPlatform !== "auto") {
    return requestedPlatform;
  }

  const normalizedSource = sourceUrl.toLowerCase();
  if (normalizedSource.includes("boarddocs.com") || /\/board\.nsf/i.test(normalizedSource)) {
    return "boarddocs";
  }

  const listingHtml = await fetchListingHtmlForDetection(sourceUrl).catch(() => "");
  if (listingHtml) {
    if (isAccordionPdfPolicyListingHtml(listingHtml)) {
      return "accordion-pdf";
    }

    if (isTableLinkedPolicyListingHtml(listingHtml)) {
      return "table-link";
    }
  }

  return "table-link";
}

async function fetchListingHtmlForDetection(url: string): Promise<string> {
  const firstAttempt = await fetchListingHtml(url, false);
  if (firstAttempt.status === 403) {
    const secondAttempt = await fetchListingHtml(url, true);
    if (!secondAttempt.ok) {
      throw new Error(`Platform detection request failed with status ${secondAttempt.status}.`);
    }
    return secondAttempt.text;
  }

  if (!firstAttempt.ok) {
    throw new Error(`Platform detection request failed with status ${firstAttempt.status}.`);
  }

  return firstAttempt.text;
}

async function fetchListingHtml(
  url: string,
  useBrowserUserAgent: boolean,
): Promise<{ ok: boolean; status: number; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 25_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(useBrowserUserAgent ? { "user-agent": BROWSER_USER_AGENT } : {}),
      },
    });

    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildCsvFilename(baseUrl: string, platform: ResolvedPolicyPlatform): string {
  const parsed = new URL(baseUrl);
  const pathSlug = parsed.pathname
    .split("/")
    .filter(Boolean)
    .slice(0, 2)
    .join("-");

  const sourceSlug = sanitizeSlug(pathSlug || parsed.hostname);
  const dateSlug = new Date().toISOString().slice(0, 10);
  return `${sourceSlug}-${platform}-policies-${dateSlug}.csv`;
}

function sanitizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "policies";
}
